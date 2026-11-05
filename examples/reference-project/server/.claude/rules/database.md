---
paths:
  - 'src/db/**/*.ts'
  - '**/*.repository.ts'
  - '**/*.service.ts'
---

# Data access

Full detail: `docs/database.md`. These are the rules that must hold in the code
you are writing right now.

## Transactions

- Repository methods take `tx: Tx` as the **first parameter**. Always. The type
  is the enforcement — there is no value of the right type outside a
  transaction, so there is no path to a table outside one.
- Writes and multi-statement reads: `withTenantTx`. Single-shot reads may use
  `withTenantRead` (autocommit) — a `BEGIN`/`COMMIT` costs two round-trips and
  holds a pooled connection for all three.
- **Keep transactions short.** Under transaction pooling the connection is held
  for the whole transaction. Never call an external API, sleep, or await a queue
  inside one. Enqueue follow-up work after commit.
- No `Scope.REQUEST`, no `nestjs-cls`, no AsyncLocalStorage on the data path.
  `tx` is passed explicitly. Providers are singletons; request scope propagates
  up the whole injection chain.
- Constructor injection uses explicit `@Inject(Token)` — `tsx` does not emit
  `emitDecoratorMetadata`, so inferred parameter types resolve to `undefined`.

## Indexes — decide BEFORE writing the query

- Every query needs a covering index. If none exists, add it **in this change**,
  declared in the same schema file as its table, named `<table>_<cols>_idx`.
- **Column order follows the query**: equality columns first, then range/sort.
  `(status, placed_at)` serves `WHERE status = ? ORDER BY placed_at DESC`.
  `(placed_at, status)` does not.
- Every foreign key gets an index. Postgres does not create one, and its absence
  turns a parent delete into a sequential scan.
- Named `uniqueIndex()`, never column-level `.unique()` — the latter emits a
  constraint the CI parity check cannot see.
- Partial indexes for skewed predicates. `INCLUDE` for hot queries reading one
  or two extra columns.
- **Decide whether a unique index is partial, and say why in a comment.** The
  two answers mean opposite things and both are defensible:
  - `roles_name_lower_active_uniq` is PARTIAL on `status <> 'archived'` — a
    role name is a label, and archiving one should free it for reuse.
  - `banks_code_lower_uniq` is ABSOLUTE — a master code is an identifier that
    outlives the row's active life and is referenced by historical records, so
    letting a deactivated row's code be claimed would make old data resolve to
    the wrong entity.
  - `users_employee_id_lower_uniq` is partial on `status <> 'deleted'`: an
    employee id identifies a person, and a genuine re-hire should get it back.
- **A partial unique index over a nullable column must also exclude NULL**
  (`WHERE col IS NOT NULL`), or several NULLs collide. See
  `users_user_name_lower_uniq`, where non-system users have no login name.

## Query shape

- Explicit column lists. `SELECT *` is lint-blocked.
- **Every list endpoint is paginated**, classic style. Use `pageParams()` and
  `paged()` from `src/http/performance.ts`:

  ```ts
  const params = pageParams(req.query);
  const [rows, total] = await tenants.withTenantRead(tenantId, async (db) =>
    Promise.all([
      repo.listByStatus(db, status, params),
      repo.countByStatus(db, status), // CAPPED count
    ]),
  );
  res.json(paged(rows, params, total));
  ```

  Never hand-roll limit/offset in a route — the helpers enforce both caps.

- **Count capped, never bare.** `count(*)` over a subquery with
  `LIMIT COUNT_CAP`. Postgres keeps no cached row count, so an unbounded count
  with a WHERE clause scans every matching row on every page view.
- **ORDER BY needs a unique tiebreaker.** `(created_at DESC, id DESC)`, not
  `created_at` alone — rows sharing a timestamp otherwise appear on two pages
  or on neither.
- Keyset paging stays for **unbounded iteration** — exports, migration fan-out,
  sync cursors — where nobody is looking at a page number.
- Batch writes: one `INSERT ... VALUES` with 500 rows, not 500 round-trips.
- No N+1. Join, or one `IN` fetch.
- Any query on a table expected to exceed 100k rows ships with
  `EXPLAIN (ANALYZE, BUFFERS)` in the PR description. `Seq Scan` on a large
  table is a blocker unless justified.
- **`EXPLAIN ANALYZE` on INSERT/UPDATE/DELETE EXECUTES the statement.** It is
  not a dry run. Wrap it in `BEGIN; … ROLLBACK;`, or run it against a scratch
  tenant — never against seeded data you still need. (Learned the hard way: an
  `EXPLAIN ANALYZE UPDATE` corrupted six rows of `users.path` in the local acme
  database. `pnpm verify:paths` caught it, which is the whole argument for
  having a recompute check.)
- **A seq scan on a small table is CORRECT, not a finding.** Postgres ignores an
  index below a few thousand rows because a heap scan is genuinely cheaper. To
  prove an index works, plant realistic volume first — `generate_series` into a
  scratch tenant — then `EXPLAIN`. An EXPLAIN over eleven rows proves nothing
  and reads as a false negative.
- **`text_pattern_ops` is required for `LIKE 'prefix%'`** on any non-C
  collation. Without the opclass the planner cannot use the index and silently
  falls back to a seq scan — while still returning the right answer, which is
  exactly why it goes unnoticed. Verify with EXPLAIN at volume: the plan should
  show `~>=~` / `~<~` bounds.

## Derived data — denormalize the read path, keep the truth normalized

Full detail: `docs/database.md`. Redundancy is welcome when it makes a read fast
**and** someone owns keeping it true. It is additive — the authoritative rows stay.

- **Ladder, stop at the first step that is fast enough**: covering index →
  generated column (`generatedAlwaysAs`, STORED, immutable same-row expression)
  → column maintained in the writing transaction → rollup table maintained by a
  job → materialized view on a schedule. Steps 1–2 cannot drift; prefer them.
- **One writer per derived value.** One repository function, or one migration
  backfill, or one trigger — never two. Say what recomputes it, what refreshes
  it, and its staleness bound in a comment on the column.
- **In the transaction if the user reads their own write.** Otherwise off the
  write path, with the age surfaced (`as_of`) — never silently stale.
- **Bounded fan-out only inside a request.** A counter or a parent total: yes.
  An `UPDATE` that could touch an unbounded number of rows (renamed agent →
  200k payout rows): chunked job, `MessageGroupId: tenantId`. The transaction
  holds a pooled connection for its whole run.
- Prefer the application write path to a DB trigger. A trigger is justified only
  when writes arrive from several paths that cannot share one function — and it
  is then the sole owner, with no application copy of the same logic.
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` needs a unique index on the view.
  It runs inside a transaction block (PG16) but holds the connection for the
  whole refresh, and the cost multiplies by N tenant databases — `maintenance`
  queue only.
- **Snapshot inputs on issued records.** Invoice lines, payouts, cost-sheet rows
  copy rate/slab/tax at issue and are never re-derived when a master changes.
  Money that is paid, invoiced, or clawed back is **recomputed from the
  authoritative rows** — a rollup is for display and filtering, never the basis
  of a payment.
- Rollups live in the tenant database they summarize. Never cross-tenant, never
  in central.
- A maintained counter is the way past `COUNT_CAP`'s "10,000+", but `paged()`
  still derives `totalIsCapped` from `total >= COUNT_CAP` — an exact total needs
  that helper taught about it, in the same PR.
- Ship a **recompute-and-compare** check with any derived value — drift is
  silent, nothing errors when a copy stops matching.

## Migrations

- Two tracks, never mixed: `src/db/central/migrations`, `src/db/tenant/migrations`.
- **Expand → migrate → contract.** Backward-compatible for one release, because
  during rollout the currently-deployed old code runs against the new schema.
- Never in one release: rename a column, add `NOT NULL` without a default, drop
  a column, change a type in place.
- `CREATE INDEX CONCURRENTLY` on large tables, in its own migration file — it
  cannot run inside a transaction block.
