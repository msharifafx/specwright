# Feature workflow

**Every feature follows this. No exceptions, no "small change" carve-out** — the steps most often skipped (load test, leak check, regression sweep) are exactly the ones whose absence is invisible until production.

A feature is not "the backend part". A feature covers **frontend and backend together**, even when the two live in separate repositories. A backend endpoint with no UI, or a UI against an unbuilt endpoint, is half a feature and must not be called done.

---

## 0. Worktree

Every feature gets its own git worktree. Never develop on `main`, never reuse a worktree across features.

```bash
git worktree add ../app-feat-<name> -b feat/<name>
cd ../app-feat-<name>
pnpm install --frozen-lockfile     # <- STEP ZERO. Not optional.
```

`node_modules` is gitignored, so a fresh worktree has none. Without this install the lint hook prints "NOT linted" on every edit and `pnpm gate` fails — two of the rules below silently stop working. pnpm's content-addressed store makes it cost about **1.2 seconds**, so there is no reason to skip it.

Removing a finished worktree: `git worktree remove ../app-feat-<name>`.

**Feature spans both repos?** That is the normal case, and it needs a worktree in
each — they are separate git repos. Use the workspace helper instead:

```bash
cd <workspace-root> && ./scripts/feature-start.sh <name>
cd ../app-feat-<name> && claude
```

It creates both worktrees on the same branch name, installs deps in each, and
copies the workspace `CLAUDE.md` and lint hook across.

**`feature-start.sh` copies each repo's `.env` into the worktree.** It is
gitignored, so a worktree without it fails at `loadEnv()` on the first
`pnpm migrate:tenants` — before doing any work, with a wall of missing-variable
errors that look like a broken checkout.

## 1. Understand before editing — regression prevention starts here

```
/graphify query "what depends on <the thing you are about to change>"
```

The single most common way to create a regression is editing something whose callers you never enumerated. Query the graph first; grep only when the graph does not know.

Prefer extending an existing function over adding a parallel one. Two functions doing almost the same thing is how behaviour diverges.

## 2. Design the data access first

Before writing a service method, decide:

- Which tables, which columns, which **index** serves the query. If no index serves it, add one in this feature — not later (`docs/database.md`).
- Whether the result is **cacheable**, and if so under which key and invalidated by which write (`docs/caching.md`). Reference data and central config are cacheable by default; assume yes and justify no.
- Whether this belongs in a request or a **job** (`docs/jobs.md`). Anything that could exceed a second under real tenant data is a job.

## 3. Build

Backend and frontend, together, to the rules in `CLAUDE.md`. While building:

- Every write in an explicit transaction, `tx` passed as the first parameter.
- Explicit column lists, keyset pagination, no N+1.
- Comments explain **why**, never what. A comment restating the code is noise; a comment explaining why the index is ordered that way is worth its line.
- File size limits are lint-enforced: 300 lines per file, 50 per function. Hitting the limit is information — it usually means two concerns are sharing a file.

## 3b. Speed — every feature, not occasionally

The frontend can only be as fast as the slowest thing it waits on, so an
endpoint is not done until it is fast:

- **Covering index confirmed**, `EXPLAIN (ANALYZE, BUFFERS)` attached for any
  table over 100k rows. This is the one that actually matters — no amount of
  compression rescues a sequential scan.
- **Cache policy chosen explicitly**: `tenantData` (revalidate, ETag gives 304),
  `reference` (max-age), or `sensitive` (no-store). Never leave it unset — a
  wrong cache header on tenant data is a cross-user leak.
- **`timed(res, 'db', ...)`** around the expensive step, so `Server-Timing`
  tells the frontend where the time went.
- **Return `nextCursor`** on any list. The client must never build a keyset
  cursor.
- **One request, not several**, for data a single screen always needs together
  — see `/masters/office-summary`.
- Anything that could exceed a second under real tenant data is a **job**.

## 4. Style guide

`STYLE_GUIDE.md` governs. **Until it is written, the ESLint and Prettier configs are the style guide** — they are executable and cannot drift from themselves.

## 5. Lint — non-negotiable

The `PostToolUse` hook lints every file as it is written. Before opening a PR:

```bash
pnpm gate     # runs scripts/gate.sh — the exact script buildspec.yml runs
```

Never add an `eslint-disable` for a rule in the CLAUDE.md hard-rules section. If a rule is genuinely wrong, change the rule and the doc together, in the same PR, with the reason.

## 6. Unit tests

Mock the boundaries, not the subject:

- **Mock**: external channel APIs, SQS, S3, clock, random.
- **Do not mock**: the database. Integration tests run against real Postgres **through PgBouncer** — mocking the database hides exactly the transaction-mode and index behaviour these tests exist to catch.

Every feature adds: happy path, the error path a user will actually hit, and one tenant-isolation test proving tenant A cannot read tenant B.

## 6b. Exercise the endpoints against the running stack

A green `pnpm gate` says the code compiles, lints, and passes its unit tests. It
says nothing about whether the feature WORKS. Before calling a backend feature
done, drive it — `pnpm start:api` and a curl script through every path that
matters:

- the happy path, end to end
- each validation rule you wrote, confirming the message lands on the right
  field (`details[].path`), not in a generic banner
- the conflict case, confirming the status code
- **tenant isolation**: create in tenant A, confirm tenant B sees nothing and
  can reuse the same natural key

This is where the User Management feature found that a cycle guard fired
correctly, that a soft delete frees an employee id for a re-hire, and that a
manager with reports is refused rather than orphaning them. None of those were
visible to typecheck or lint.

Keep the script; paste its output into the PR. A dozen labelled assertions
against a real database is the cheapest evidence a reviewer can act on.

## 7. Load test — multi-tenant, not single-tenant

```bash
pnpm local:up && pnpm start:api   # the load is HTTP; it needs the API up
pnpm loadtest
```

**Both this and the leak probe need `k6`, and neither is useful without it.** It
is not a repository dependency — install the binary once:

```bash
curl -sSL https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz \
  | tar xz -C /tmp && install /tmp/k6-v0.54.0-linux-amd64/k6 ~/.local/bin/k6
```

Both scripts now **fail** when it is missing rather than degrading quietly. That
is deliberate and it is a change: `leak-probe.sh` used to fall back to `sleep`
and report a pass, and `pnpm loadtest` shelled out to a command that was not
there. A probe that cannot measure has not passed.

A single-tenant load test tells you almost nothing about this system. `loadtest/multi-tenant.js` runs a **noisy tenant flooding the feature while quiet tenants do normal work**, and asserts on the quiet tenants:

| Assertion                       | Threshold                           |
| ------------------------------- | ----------------------------------- |
| Quiet-tenant p95 latency        | < 500ms while a noisy tenant floods |
| Quiet-tenant error rate         | < 1%                                |
| `TenantCapacityError` (503)     | 0                                   |
| PgBouncer `cl_waiting`          | 0 sustained                         |
| Seq scans on tables > 100k rows | 0                                   |

Numbers, because "we load tested it" is not a result.

**Queue fairness cannot be tested locally.** No free local SQS double implements fair queues — `MessageGroupId` is accepted and ignored. Fairness is verified against **real SQS in uat only**. A green local load test says nothing about starvation; do not treat it as if it does.

## 8. Memory leak check — backend only

Long-lived worker processes holding per-tenant state leak in specific, predictable ways. The three that matter here:

1. **Pools evicted from the registry LRU without `.end()`** — the socket and its backend stay alive.
2. **Valkey client listeners** added per request or per job and never removed.
3. **SQS long-poll closures** capturing a tenant context that outlives the message.

```bash
pnpm leakcheck    # sustained load, two heap snapshots, RSS delta
```

Passes if **RSS growth < 50MB over 10 minutes** at steady load and heap-snapshot object counts for pools, sockets, and listeners are flat. This is a **nightly pipeline job**, not a PR gate — it is too slow and too noisy at PR latency. Run it locally when a feature adds anything long-lived.

## 8b. Observability

A feature that cannot be debugged in production is not finished. Before the PR:

- Errors carry `traceId` — reachable from a log line to the trace and back.
- Any new SQS producer propagates trace context in message attributes; any new
  consumer continues the trace rather than starting one.
- New metrics use only bounded dimensions. **`tenantId` is never a dimension**
  (`docs/observability.md`) — it goes on the span and in the log line.
- A new failure mode that should page someone has an alarm, with a threshold.

## 9. Regression sweep

- `/graphify query "what calls <changed function>"` — confirm every caller still holds.
- Run the full test suite, not just the new tests.
- If behaviour changed deliberately, say so in the PR description and name what depends on it.
- Migrations: expand-then-contract, and confirm the **currently deployed** code still runs against the new schema. During rollout it will.

## 9c. The cases — write down what the product now DOES

**Before you finish, ask what a user would notice.** A new screen, a changed
refusal, a field that stopped being editable, a control that no longer exists —
each of those is a CASE, and cases live in `e2e-app/cases/`.

**The cases are the specification. The scripts follow them, never the reverse.**
That direction is the whole point of the arrangement: `cases/**/*.md` are English
tables a tester can read and change without opening a script, and
`pnpm cases:check` fails the moment the two disagree. Write the case FIRST — even
for behaviour that is not automated yet — and the gap becomes visible instead of
imaginary.

What to do, by what you did:

| You | The cases |
|---|---|
| Added behaviour | Add a case. It can be scripted later; written down, it is not forgotten. |
| Changed behaviour | Edit the Expected column of the cases it touches. |
| Removed a feature | DELETE its cases first, then the scripts follow — see `feat/remove-re-registration`, which dropped `MAS-RR-001..005` in `cases/` and the scripts in the same commit. |
| Fixed a defect | If the case would not have caught it, the case was too weak. Strengthen it, and say in the commit what it now catches. |

**A case describes BEHAVIOUR, never mechanism.** No selectors, no routes, no
endpoint paths, no test ids — those change without the product changing, and a
case that names one is a case that goes stale on a refactor. "Refused, saying
which way round the dates go" is a case. "`PUT /masters/standard-payouts` returns
400" is not.

**Use the same branch name in the e2e repo.** All three repositories carry
`feat/<name>`, so the case change travels with the code change and whoever picks
up the script work has a diff to read rather than a product to re-derive.

```bash
cd ../e2e-app
git checkout -b feat/<name>          # the same name as the other two repos
$EDITOR cases/screens/<area>.md      # or cases/journeys/<area>.md
pnpm cases:check                     # names every case with no script, and the reverse
```

`cases:check` failing after a case edit is CORRECT and is the signal, not an
error to code around: it is telling you which scripts now have to move. Adjusting
them is the next piece of work, and it is a piece of work somebody can pick up
from the diff alone.

## 10. Finish

```bash
pnpm gate
/graphify . --update          # keep the graph true; the next feature queries it
git worktree remove ../app-feat-<name>
```

Updating the graph is part of finishing, not an afterthought. A stale graph makes step 1 actively misleading for whoever works next.

---

## PR checklist

Copy into the description:

```
- [ ] Frontend and backend both covered (or explicitly N/A, with reason)
- [ ] Worktree used; `pnpm install` run in it
- [ ] Indexes: query has a covering index, declared in the schema file
- [ ] EXPLAIN (ANALYZE, BUFFERS) attached for any table > 100k rows
- [ ] Derived data (if any): one owner, refresh path and staleness stated, recompute-and-compare check, no unbounded fan-out in a request
- [ ] Endpoints exercised against the running stack, including one tenant-isolation check — output pasted below
- [ ] Caching decided: cached (key + invalidation) or justified as not cacheable
- [ ] Cache-Control policy set explicitly; Server-Timing on the expensive step
- [ ] List endpoints return nextCursor
- [ ] pnpm gate passes
- [ ] Unit tests incl. one tenant-isolation test
- [ ] Multi-tenant load test run; quiet-tenant p95 < 500ms
- [ ] Memory leak probe run (if anything long-lived was added)
- [ ] Observability: traceId reachable, SQS context propagated, no tenant dimension
- [ ] Callers enumerated via graphify; no regression
- [ ] Files within size limits
- [ ] Cases added or updated in `e2e-app/cases/` for any behaviour a user would notice; `pnpm cases:check` run and its output understood
- [ ] Graph updated
```
