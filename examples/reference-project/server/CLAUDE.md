# Reference project — Server

NestJS backend for a multi-tenant SaaS channel-operations platform. **Database per tenant** on Aurora PostgreSQL, dynamic per-tenant connection pools, horizontally scaled on ECS Fargate, background jobs on SQS.

This file is the contract for every session in this repo. The rules below are not style preferences — each one guards a failure mode that is **silent until production**. Read the linked doc before relaxing any of them.

## Before you start

Query the code graph before any broad search — it is faster and cheaper than grepping:

```
/graphify query "how does tenant connection resolution work"
/graphify . --update    # refresh when stale (>7 days or after a large merge)
```

## Stack

| Layer      | Choice                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Framework  | NestJS (TypeScript, strict)                                                                    |
| ORM        | **Drizzle** — schema is module-level and shared; per-tenant cost is one `pg.Pool`              |
| Tenant DB  | Aurora PostgreSQL, one database per tenant                                                     |
| Central DB | Aurora PostgreSQL, one database — tenant registry, masters, config                             |
| Pooling    | **Direct to the Aurora writer**; the registry owns the per-tenant LRU. PgBouncer in transaction mode is the documented later step, **not deployed** — `infra/terraform/README.md`. RDS Proxy is not viable at all (`docs/multi-tenancy.md`) |
| Queue      | **SQS standard + fair queues**, `MessageGroupId = tenantId`                                    |
| Cron       | **EventBridge Scheduler** → SQS directly                                                       |
| Cache      | **ElastiCache Valkey** — cache, locks, idempotency. **Not a queue.**                           |
| Compute    | ECS Fargate (ARM64). Workers on Fargate Spot.                                                  |

---

## Hard rules

### Connections — `docs/multi-tenancy.md`

1. **Never construct a pool or db handle inline.** No `new Pool()`, no `new Client()`, no `drizzle()` outside `src/db/registry`. An ad-hoc pool is invisible to the connection budget, and the budget is the thing that keeps this architecture alive.

   `src/db/registry` has **two** entry points, and which one applies is decided by whether the tenant is servable yet:
   - **`TenantConnectionRegistry`** — every request and every job. Pools are budgeted, leased, and evicted LRU. If you are touching an active tenant's data, this is the only answer.
   - **`ProvisioningConnection`** — the short-lived admin connection used while a tenant is being CREATED. It exists because the registry resolves nothing until `tenants.status = 'active'`, so the saga that builds a database has no way to reach it, and because `CREATE DATABASE` and `CREATE ROLE` are cluster-level statements that mint the very credentials the registry would need. `max: 1`, one callback, `.end()` in a `finally`, never in the LRU. Reaching for it because it is convenient puts a write outside the budget and outside tenant scoping.
2. Per-tenant pool is `{ min: 0, max: 2, idleTimeoutMillis: 30_000 }`. The registry caps live pools at `MAX_LIVE_TENANT_POOLS` (default 10) and evicts the least-recently-used idle tenant beyond that. These two numbers set the **task ceiling** — 30 connections per task allows 12 tasks on `db.t4g.medium`. Raising either means lowering the ceiling (`docs/scaling.md`).
3. Respect the budget:
   ```
   (app_tasks × MAX_LIVE_TENANT_POOLS × pool.max) + (app_tasks × central_pool.max)
       ≤ pgbouncer.max_client_conn
   ```
   PgBouncer pools are per **(user, database)** pair, so tenant count multiplies. Use `default_pool_size=2`, `max_db_connections=8`. Workers count too — they open tenant connections through the same registry.
4. **Write as though PgBouncer were already in transaction mode**, so anything that assumes a pinned session is banned and lint-enforced: named prepared statements (Drizzle `.prepare()`), session-level `SET` (use `SET LOCAL`), `LISTEN`/`NOTIFY`, `pg_advisory_lock` (use `pg_advisory_xact_lock`), temp tables spanning statements. **The pooler is not deployed yet** — connections go straight to the Aurora writer — and these rules stay in force anyway: every one of them costs nothing to obey now and is expensive to retrofit across the whole codebase on the day the pooler lands.

### Transactions — `docs/database.md`

5. **Repositories accept `tx` as their first parameter, always.** The raw db handle never leaves the registry. This makes "writes happen in a transaction" a compile-time fact, not a convention:
   ```ts
   findOpen(tx: Tx, tenantId: string): Promise<Order[]>   // ok
   findOpen(db: Database, tenantId: string)               // lint error
   ```
   Single entry point: `withTenantTx(tenantId, async (tx) => { ... })`.
6. **Scoped, not absolute:** all writes and all multi-statement reads run in an explicit transaction. A single-shot read may run in autocommit — wrapping it costs two extra round-trips and holds a pooled connection longer, which is expensive precisely because of rule 3.
7. **No `Scope.REQUEST` providers on the data path, and no ambient transaction lookup** (including `nestjs-cls`). `tx` is passed explicitly. Request-scoped providers bubble up the entire injection chain, and ambient transaction retrieval reintroduces exactly the invisible coupling rule 5 exists to remove. NestJS's reflex here is the wrong one.
8. No cross-tenant queries, ever. No tenant business data in the central DB.
9. No string-interpolated SQL. Use the `sql` tagged template with bound parameters.

### Central database — `docs/architecture.md`

10. Holds only: `tenants` (connection info + `schema_version`), master/dropdown tables, and `config(scope, key, value JSONB)` unique on `(scope, key)`. `scope` is `'global'` or a tenant id; tenant rows override global.
11. **Central config is always read through the Valkey read-through cache**, never per request, and invalidated by the write path — never TTL-only. Every task for every tenant reads this database; an uncached per-request read makes it the platform-wide bottleneck that database-per-tenant exists to avoid. It looks fine at five tenants.
12. The central pool is fixed size (`max: 10` per task) and counted separately in the rule-3 budget.

### Indexes and queries — `docs/database.md`

13. Every index is declared in the same schema file as its table, named `<table>_<cols>_idx`. CI fails if the live database and the schema disagree.
14. Adding a query means confirming a covering index exists, or adding one in the same PR.
15. Any query on a table expected to exceed 100k rows ships with `EXPLAIN (ANALYZE, BUFFERS)` output in the PR description.
16. No `SELECT *`. Explicit columns.
17. **Every list endpoint is paginated, classic style** — `page`, `pageSize`, and a total. Use `pageParams()` and `paged()` from `src/http/performance.ts`; never hand-roll limit/offset in a route. Two caps are mandatory and both are enforced by those helpers: the count stops at `COUNT_CAP` (Postgres has no cached row count, so an unbounded `COUNT(*)` scans every matching row on every page view) and depth stops at `MAX_PAGE` (`OFFSET 250000` reads and discards 250,000 rows). Past either cap the UI shows "N+" and asks for a narrower filter.
18. Count with the **capped** pattern — `count(*)` over a subquery with `LIMIT COUNT_CAP` — never a bare `count(*)`. The paging query needs a covering index with the sort columns, and a **unique tiebreaker in the ORDER BY**: without one, rows sharing a timestamp appear on two pages or on neither.
19. Keyset paging stays for unbounded iteration — exports, migration fan-out, sync cursors — where nobody is looking at a page number.

### Derived data and denormalization — `docs/database.md`

Reads must be fast, and the read path is where that is won. Denormalization is a first-class tool here, not a last resort — under the conditions below, which are what separate a design from a wrong number.

62. **Normalize the source of truth, denormalize the read path.** A derived column, rollup table, or snapshot is **additive** — it never replaces the authoritative rows. Work down the ladder and stop at the first step that makes the query fast: covering index → generated column (`generatedAlwaysAs`, STORED) → column maintained in the writing transaction → rollup table maintained by a job → materialized view on a schedule. Every step down buys speed with a copy that can drift.
63. **Every copy names one owner and a refresh path.** One repository function, or one migration backfill, or one trigger — never two — writes it, and the schema file states what recomputes it, what refreshes it, and how stale it may be. The feature ships a **recompute-and-compare check**, because drift is silent: nothing errors when a copy stops matching.
64. **Read-your-writes goes in the transaction; everything else is a job and shows its age.** Maintain the value in the same transaction when a user sees it right after their own write. Otherwise maintain it off the write path and surface the staleness (`as_of` in the response and on the screen). A number quietly ten minutes old is how a reconciliation dispute starts.
65. **A write may not fan out unboundedly.** One logical change that touches an unbounded number of derived rows — an agent renamed across 200k payout rows — is a **chunked job** with `MessageGroupId: tenantId`, never an `UPDATE` inside the request transaction. Rule 3 is why: that transaction holds a pooled connection for its entire run. Bounded fan-out (a counter, a parent total) stays in the transaction. Prefer the application write path over a database trigger; a trigger is justified only when writes arrive from several paths that cannot share one function, and it is then the **sole** owner.
66. **Materialized views are `maintenance`-queue work only** — never a request, never `interactive`. `REFRESH ... CONCURRENTLY` needs a unique index on the view; it does run inside a transaction block (verified, PG16), so transaction pooling is not the obstacle — holding one connection for the whole refresh is, and the cost multiplies by every tenant database.
67. **Snapshot what must not change; recompute what must be right.** An invoice line, payout, or cost-sheet row copies its inputs at issue — rate, slab, tax — and is never re-derived when a master changes later; that redundancy *is* the requirement. Conversely, display totals may come from a rollup, but amounts **paid, invoiced, or clawed back are recomputed from the authoritative rows**. A rollup is never the basis of a payment. Rollups live in the tenant database they summarize — never across tenants, never in central.

### Migrations — `docs/database.md`

20. Two independent tracks, never mixed: `src/db/central/migrations` and `src/db/tenant/migrations`.
21. Tenant migrations fan out as a **batched, resumable job** that records `tenants.schema_version`. **A deploy is not done until every tenant reaches the target version.**
22. Every migration is backward-compatible for one release: expand → migrate → contract. The old code must run against the new schema, because during rollout it will.

### Jobs — `docs/jobs.md`

23. **Every message carries `MessageGroupId: tenantId`.** That single property is what makes SQS fair queues deprioritize a noisy tenant. Omit it and the tenant is treated as its own group, silently losing fairness.
24. One queue per job class — `interactive`, `bulk`, `maintenance` — each with its own ECS service. Fair queues solve tenant-vs-tenant, not class-vs-class: in a shared queue a tenant's own 40k-product import still blocks that tenant's "publish now" click.
25. Handlers are **idempotent**. SQS standard is at-least-once, and Fargate Spot interrupts workers mid-message.
26. Chunk long work into paged messages rather than one long message. Visibility timeout caps at 12h, and small units make retries and fairness granular.
27. Payloads over 256KB go to S3; the message carries the key.
28. Retries via redrive policy + DLQ, with a CloudWatch alarm on DLQ depth. Do not hand-roll retry loops.
29. Cron is **EventBridge Scheduler targeting SQS directly** — no compute in between. Per-tenant schedules named `t-<tenantId>-<jobKey>`. Always set a flexible time window so tenants do not all fire at 00:00.

### Caching — `docs/caching.md`

30. Keys are `{ez}:<env>:t:<tenantId>:<domain>:<id>` — the hash tag keeps a tenant's keys on one Cluster slot. Global keys use `{ez}:<env>:global:...`.
31. Invalidate on write. TTL is a safety net, not the strategy.
32. Cache never holds anything that has not been persisted. It is not a write buffer.

### Edge and tenant hosts — `docs/edge.md`

32b. **One CloudFront distribution is the only entry point** — `/api/*` to the ALB, `/*` to the SPA bucket, so the UI and API are same-origin. Never introduce a separate `api.` host: it brings dynamic per-tenant CORS, a preflight on every mutation, and a third-party refresh cookie. The origin request policy **must forward `Host`**, because tenant identity is derived from it.
32c. **`app.` is the platform host and resolves no tenant.** It serves the tenant selector and the super-admin portal, is a reserved slug along with `www`/`api`/`admin`/`static`, and never falls back to a default tenant. Super-admin endpoints live under `/api/admin/*` and are refused on tenant hosts; an admin acting on a tenant still goes through `withTenantTx` for that tenant.
32d. **Any subdomain resolves under the wildcard.** A slug with no active registry row is a 404 answered from the **cached** registry — a database round-trip per unknown host makes the wildcard a cache-miss amplifier.

### AWS — `docs/aws.md`

33. **Lambda must never open a tenant database connection.** Each execution environment holds its own pool, so a few hundred concurrent invocations blows the connection budget — and the usual fix, RDS Proxy, is unusable here because it multiplexes connections and a proxy per tenant defeats its purpose. Lambda is fine for work that never touches a tenant DB: webhook receivers that validate and enqueue, event plumbing, notifications.
34. Everything is tagged `Environment`, `Service`, `CostCenter`. Untagged resources cannot be attributed and will not be approved.

### Feature workflow — `docs/feature-workflow.md`

35. **Every feature follows `docs/feature-workflow.md`.** No "small change" exemption. Read it at the start of a feature, not after.
36. A feature covers **frontend and backend together**. A backend endpoint with no UI is half a feature and is not done.
37. Work in a **git worktree** — `git worktree add ../app-feat-<name> -b feat/<name>`, then **`pnpm install` in it** (~1.2s). Skipping the install silently disables the lint hook and breaks `pnpm gate`.
38. Before editing, `/graphify query "what depends on X"`. Editing without enumerating callers is the most common way to create a regression.
39. Before opening a PR: `pnpm gate`. On finish: `/graphify . --update` — a stale graph makes rule 35 misleading for whoever works next.
40. Style is governed by `STYLE_GUIDE.md`. **Until it is written, the ESLint and Prettier configs are the style guide** — they are executable and cannot drift from themselves.
41. File size is lint-enforced: **300 lines per file, 50 per function**. Hitting the limit usually means two concerns share a file.
42. Comments explain **why**, never what. A comment restating the code is noise.
43. Load test is **multi-tenant** — a noisy tenant flooding while quiet tenants work. Quiet-tenant p95 < 500ms, zero `TenantCapacityError`. **Queue fairness cannot be tested locally** and is verified in uat against real SQS only.
44. Anything long-lived added (pool, listener, timer, closure over tenant context) means running `pnpm leakcheck`. Budget: RSS growth < 50MB over 10 minutes.
45. Caching is decided per feature, not retrofitted: either a key and its invalidation, or a stated reason it is not cacheable.

### Speed — `docs/performance.md`

The frontend can only be as fast as the slowest thing it waits on. Every endpoint is checked for this, on every feature:

52. **Set a `Cache-Control` policy explicitly** — `tenantData`, `reference`, or `sensitive`. Never leave it unset: a wrong cache header on tenant data is a cross-user leak.
53. **Wrap the expensive step in `timed(res, 'db', ...)`** so `Server-Timing` tells the frontend where the time went.
54. **Every list endpoint is paginated** via `pageParams()` + `paged()`. Never hand-roll limit/offset — the helpers enforce the count cap and the page-depth cap.
55. **Issue independent queries together.** Rows and the count in one `Promise.all`; awaiting one then the other doubles page latency.
56. **One request for what a screen always needs together** — see `/masters/office-summary`, which answers five counts in one `withTenantRead`. Two round-trips before first render is the difference between fast and sluggish.
57. Anything that could exceed a second under real tenant data is a **job**, not a request.

### Files, email, and text — `docs/storage.md`, `docs/i18n.md`

46. **Files never pass through the API.** Mint a signed S3 request; the browser transfers directly. Anything over the category's ceiling, or that a user waits for, is a job. The platform ceiling is **200MB** — raised from 25MB for streamed loan-data imports — and `CATEGORY_LIMITS` lowers it per category. That map is **floor-lowering**, so raising the platform number means auditing the list too, or an unlisted category silently inherits the new bound (`docs/storage.md`).
47. **Uploads are presigned POST, never PUT.** S3 does not verify Content-Length on a PUT, so only a POST policy can enforce size and content type. Verified: oversize upload returns 400 from S3 itself. This is why 200MB did **not** become multipart, which is PUT-per-part.
48. **Keys are server-generated and tenant-prefixed** (`t/<tenantId>/...`). A client-supplied key is path traversal. `assertTenantOwnsKey` before signing a download is the authorisation check.
49. Content types are an **allowlist**, matched exactly. `starts-with 'image/'` would admit SVG, which is stored XSS. For spreadsheet categories the type is derived **server-side from the file extension** rather than trusted from the request — browsers disagree about `.csv` and `.xlsx`, and the POST policy pins it with `eq`.
50. **Every user-visible string comes from an i18n catalog** — API error messages and email subjects included, not just UI copy. Locale comes from the tenant's registry row.
51. **Not translated:** log messages, error `code` values, job keys, queue names, database identifiers. Each is something that depends on the string staying stable.
52. Message subjects and bodies come from the **`templates` table**, keyed by `(channel, key, locale)` for `email`, `sms` and `in-app` — tenant row first, central default behind it, resolved by `TemplatesService.resolve(tenantId, channel, key, locale)` (`docs/i18n.md`). Not from a catalog: an error message is the product's words, a message body is content a tenant may rewrite. Platform defaults are seeded from `scripts/data/templates-{email,sms,in-app}.json` by `pnpm seed:templates`. An SMS template carries `provider_refs` — the DLT id or WhatsApp template name each provider knows it by — so one logical template serves every vendor. Sending is a **job**, never a request-path call. Log the messageId, never the body.

### Observability — `docs/observability.md`

53. **Instrument in plain OpenTelemetry.** Never emit EMF from application code, and never call a CloudWatch SDK to **publish**. Dimension and cardinality policy lives in `otel/collector.yaml`, so the backend is a config block rather than a rewrite. The ban is on the EMIT path: **reading** AWS control-plane and alarm state is a product feature of the platform-admin Infrastructure screen, creates no dimensions, and is confined to `src/modules/admin/infrastructure/` by `no-restricted-imports`.
54. **`tenantId` is never a metric dimension.** CloudWatch bills $0.30 per unique dimension combination — 500 tenants × 10 metrics would be $1,500/month. It goes on the span as an indexed attribute and in the log line, never in `metric_declarations`.
55. **Every log line carries `traceId`.** This is the only thing that joins logs to traces. Also `requestId` and `tenantId`; worker logs add `jobKey`, `messageId`, and attempt.
56. **Trace context propagates through SQS message attributes.** Without it every background job is an orphan trace and the whole async half of the system is invisible. Retrofitting means touching every handler.
57. Set **`OTEL_TRACES_SAMPLER=xray`**. ADOT's Node.js auto-instrumentation defaults to **100% sampling** without it — every request on a live API.
58. The budget is **~$5/month**. Container Insights, Synthetics canaries, RUM, and Application Signals were each priced and rejected. Do not add one without re-running the arithmetic in `docs/observability.md`.
59. Paging is CloudWatch alarms on **native** metrics — deliberately outside the app's blast radius. `TenantCapacityError > 0` is both an alarm and the prod deploy rollback trigger.

### CI/CD — `docs/cicd.md`

60. AWS-native: CodePipeline + CodeBuild + ECS-native blue/green. No GitHub Actions. **The pipeline is not provisioned yet — `pnpm gate` is the interim PR gate** and must stay identical to `buildspec.yml`.
61. Migrate runs **before** deploy, and the deploy is not done until every tenant reaches the target `schema_version`.

---

### DRY — `.claude/rules/dry.md`

58. **Every piece of knowledge has one authoritative place.** If two places must agree for the code to be correct, one of them is wrong. The owners are listed in the rule file — `src/config/env.ts` for environment, `src/db/registry` for pools, `src/cache/keys.ts` for keys, `src/i18n` for strings, the schema file for table shape. **Derived data is the exception, and only under rules 62–67**: a rollup or snapshot duplicates a *value*, not the knowledge. The knowledge is the derivation, and it still has exactly one owner.
59. **Rule of three.** Two occurrences are a coincidence; three are a pattern. A wrong abstraction costs more than duplication — duplication is cheap to find and delete, a premature base class is threaded through every caller.
60. **Same shape is not same knowledge.** Two functions that look identical but change for different reasons stay separate. Ask what would make each one change; different answers mean leave them alone.
61. **No `BaseService` or `BaseRepository`.** Compose instead — `withTenantTx`, `timed`, `readThrough`, `paged` wrap behaviour without forcing every domain into a shape defined by the first one written.

## Conventions — `docs/conventions.md`

- `src/modules/<domain>/` holds `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/`. Controllers do no business logic; repositories do no business logic.
- Errors: throw domain errors from services, map to HTTP in a filter. Never leak a driver error to a client.
- Logs are structured JSON with `tenantId`, `requestId`, `jobId`. Never log secrets, tokens, or full payloads.
- Every module owns its tests. Integration tests run against a real Postgres in a container, never a mock.

## How these rules are enforced

Three layers, so a rule does not depend on being remembered:

| Layer                | What it does                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` hook   | Lints every `.ts` file the moment it is written                                                                                                       |
| `.claude/rules/*.md` | Path-scoped detail that auto-loads when you touch matching files — `src/db/**` pulls in the index and transaction rules, `src/queue/**` the job rules |
| `Stop` hook          | **Blocks the turn from ending while `pnpm typecheck` fails** (~7s)                                                                                    |

The Stop hook runs typecheck rather than the full gate: lint is already covered per-file, so the genuine gap is cross-file breakage. Run `pnpm gate` yourself before a PR — it adds unit tests and the migration check.

What no hook can enforce: the load test, the leak probe, whether a derived value still matches a recompute, and whether you actually thought about the connection budget. Those stay in `docs/feature-workflow.md`.

## Working agreement

- Run `pnpm gate` before declaring work done. A `PostToolUse` hook lints each file you touch and a `Stop` hook typechecks the project — do not disable either.
- Never add an `eslint-disable` for a rule in the "Hard rules" section. If a rule is genuinely wrong, change the rule and the doc together, in the same PR, with the reason.
- When a rule here conflicts with something you were about to write, the rule wins. Say so and propose the change rather than working around it.
