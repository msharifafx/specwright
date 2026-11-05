# Feature workflow

**Every feature follows this. No "small change" exemption.** The steps most
often skipped (clarifying, running it yourself, the load and leak checks) are
the ones whose absence is invisible until production.

A feature covers **every unit it touches** — API and UI, service and client,
job and the screen that shows its result. Half a feature is not done.

## 0. Worktree

```bash
./scripts/feature-start.sh <name>      # a worktree per repo, deps installed
cd ../<prefix><name> && claude
```

Never develop on the default branch. Never reuse a worktree across features.

## 1. Clarify before designing

1. Read the requirement from `<REQUIREMENTS_DIR>` — stated requirements only
   bind; inferred ones are leads.
2. Read the design source (prototype markup, design file) for every screen.
3. Read `<DECISIONS_FILE>` and `<QUESTIONS_FILE>` for anything touching it.
4. **Look for contradictions** — requirement vs requirement, requirement vs
   design, requirement vs existing behaviour, requirement vs an invariant.
   Each one goes into `<QUESTIONS_FILE>` with both sides quoted.
5. **Ask** the questions whose answer changes what gets built. Do not build
   on an open contradiction; build the parts it does not touch.

## 2. Understand before editing

Enumerate the callers of anything you will change (code graph, IDE, grep).
The commonest regression is editing something whose callers were never
listed. Prefer extending an existing function over adding a parallel one.

## 3. Write the case first

Anything a user would notice — a new screen, a changed refusal, a removed
control — is a case in `<CASES_DIR>`, in plain English, before code. Removing
a feature starts by deleting its cases.

## 4. Design data access and cost first

- Which queries, which **index** serves each. No index → add it now.
- What is **cached**, under which key, invalidated by which write.
- What runs in a request vs a **background job** (anything that could exceed
  a second on real data is a job).
- What a list costs at production volume. Pagination is server-side.

## 5. Build both halves

- The producer publishes its contract (OpenAPI, GraphQL, protobuf); the
  consumer generates its client from it. Neither hand-writes the other's types.
- Comments explain **why**, never what.
- Size limits are lint errors. Hitting one means two concerns share a file.

### 5b. Speed — every feature, not occasionally

- Covering index confirmed; a query plan attached for any table over ~100k rows.
- Cache policy set explicitly per response (tenant/user data revalidated,
  reference data cached, sensitive never cached). An unset cache header on
  private data is a cross-user leak.
- Server timing on the expensive step, so the client can see where time went.
- Lists return a server-built cursor; the client never builds one.
- One request for data a screen always needs together; no request waterfalls;
  one request per view change, not per keystroke (debounce filters).
- New routes/screens lazy-loaded; bundle budget held; heavy dependencies
  loaded at the point of use.

### 5c. Migrations

Expand, then contract. The currently deployed code must still run against
the new schema, because during rollout it will. A schema change without a
migration fails the gate.

## 6. Tests

Mock the boundaries (third-party APIs, queues, clock), never the subject and
never the database. Network mocks are built from the GENERATED contract
types, so a contract change breaks the test instead of passing against a
fiction. UI tests find elements by role and accessible name, the way a user
does; needing a test id is a defect in the component. Every feature adds the happy path, the error a user will
actually hit, and — where there is any isolation boundary (tenant, account,
permission) — one test proving it holds.

## 7. Gate

```bash
<GATE_CMD>          # identical to CI
```

## 8. Run it yourself

A green gate proves the code compiles and its assertions hold. It cannot see
a clipped dropdown, a misaligned form or a button that does nothing.

- **API / service**: drive every path with curl or a script — happy path, each
  validation (does the message land on the right field?), the conflict case,
  the isolation case. Keep the script; paste its output into the PR.
- **UI**: use the screen in a real browser. Open every control, resize, read
  every message. Compare side by side with the design source.
- **Mobile / desktop / CLI / data pipeline**: the equivalent — run it on a
  device or emulator, run the command, run the pipeline on a realistic sample.
- **Check you are hitting what you changed.** With several worktrees, the
  server on the usual port may be another branch's.

## 9. Volume, load and leaks (when it applies)

- Performance at production volume, not fixture volume.
- Load test where several users/tenants share resources: assert on the
  QUIET ones while a noisy one floods.
- Leak probe for anything long-lived: memory flat over a sustained run.

## 9b. Observability

A feature that cannot be debugged in production is not finished.

- Errors carry a trace id, reachable from a log line to the trace and back.
- New queue producers propagate trace context; consumers continue it.
- New metrics use bounded dimensions only — never a tenant, user or request
  id as a dimension (cost and cardinality); those go on the span and the log.
- A new failure mode that should wake someone has an alarm with a threshold.

## 10. Finish

1. Regression sweep: callers still hold; the full suite, not only new tests.
2. Learned something that cost time? A memory note.
3. Deferred something? `<DECISIONS_FILE>`.
4. Stop every server and container your session started.

## PR checklist

```
- [ ] Every unit the feature touches is covered (or N/A with a reason)
- [ ] Requirement and design source read; contradictions logged and answered
- [ ] Case written/updated in <CASES_DIR>; cases check run
- [ ] Indexes, caching and job-vs-request decided
- [ ] Contract regenerated and committed; client generated from it
- [ ] Tests: happy path, user-facing error, isolation boundary
- [ ] <GATE_CMD> passes
- [ ] Run by hand (API script output / screenshots below)
- [ ] Speed: index + plan, cache policy, server timing, cursor pagination
- [ ] Migrations expand-then-contract; deployed code runs on the new schema
- [ ] Observability: trace id reachable, context propagated, bounded metrics
- [ ] Derived data (if any): one owner, refresh path, recompute-and-compare
- [ ] Volume / load / leak checks, if applicable
- [ ] Decisions and lessons recorded
```
