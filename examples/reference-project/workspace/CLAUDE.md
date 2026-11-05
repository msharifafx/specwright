# Reference project — workspace

**Three git repositories.** This directory is `app-workspace`; the two application repos are cloned inside it and gitignored here (not submodules). See [README.md](README.md).

**Start a session here** — features span both applications, so this is the normal place to work.

| Repo | What |
|---|---|
| [server-app/](server-app/) | NestJS API + workers. Drizzle, Aurora PostgreSQL **database per tenant**, SQS, Valkey. |
| [web-app/](web-app/) | React SPA. shadcn/ui + Tailwind, TanStack Query/Table. |

Each repo's `CLAUDE.md` is self-contained and duplicates the shared architecture it needs, because the repos are cloned independently and no import can cross between them.

## How rules and hooks reach a root session

The two mechanisms behave differently, and it matters:

- **CLAUDE.md** — ancestors load at launch; a **subdirectory `CLAUDE.md` loads on demand** when Claude first reads a file in that subtree. So editing a server file pulls in the server rules automatically, and a root session stays light until it needs them. Nothing to configure.
- **`.claude/settings.json`** — read from the **session's project root only**. A `settings.json` inside a subdirectory is never loaded, so the repo-level lint hooks would do nothing from here.

The fix is `.claude/hooks/lint.sh`, which resolves the owning repo by walking **up from the edited file** and runs that repo's ESLint. An identical copy sits at this root and in each repo, so the same hook works whether the session starts here, inside a repo, or in a feature worktree. Verified working from all three.

One caveat worth knowing: nested `CLAUDE.md` files are **not re-injected after `/compact`** — they reload the next time Claude reads a file in that repo, which in practice is immediate. If you want a repo's rules pinned for a whole session regardless, add `@server-app/CLAUDE.md` to this file; the cost is that its full rule set occupies context from launch.

## Starting a cross-repo feature

A feature spans both repos, and they are separate git repos, so it needs a worktree in **each**:

```bash
./scripts/feature-start.sh orders-bulk-export
cd ../app-feat-orders-bulk-export && claude
```

That creates both worktrees on `feat/orders-bulk-export`, runs `pnpm install` in each (step zero — a fresh worktree has no `node_modules`, and without it the lint hook reports "NOT linted" on every edit), and copies this `CLAUDE.md` and the hook across. The feature directory mirrors this layout, so a session there behaves identically.

Backend services keep running from the **main checkout** — one local stack is shared across features:

```bash
cd server-app && pnpm local:up && pnpm local:verify
```

Working in a single repo only? Start the session in that repo; everything still works.

## The shape, in one paragraph

Multi-tenant SaaS for channel operations. Every tenant gets its own PostgreSQL database on Aurora with an identical schema; a central database holds the tenant registry, master data, and key-value JSON config. The API and workers run on ECS Fargate and reach tenant databases through PgBouncer in transaction mode, with a bounded LRU of per-tenant connection pools. Background work goes through SQS standard queues where `MessageGroupId = tenantId` makes fair queues deprioritize a noisy tenant automatically; cron is EventBridge Scheduler targeting SQS directly. ElastiCache Valkey is cache and locks only, never a queue.

## What the product must do — read this before building a feature

The requirements live in **[docs/domain-graph/](docs/domain-graph/)** — the client's BRDs
(five, plus the P&L Dashboard BRD) and the clickable prototypes, extracted into a queryable
graph of 481 concepts and 1,041 relationships.

Those documents call the product **the client product** (the client, authored by
the vendor). We call it **the reference project**. Same product — the client's name is left
as-is inside `docs/domain-graph/`, because rewriting a quotation makes it impossible to
check against the original. Use the reference project everywhere else.

**Start at [`docs/domain-graph/wiki/index.md`](docs/domain-graph/wiki/index.md).** It lists
21 communities — Loan Data Reconciliation, Master Configuration, Payout Calculation,
Invoicing & Payment, Agent Onboarding, Matching Rule Engine, Clawback Recovery, and
others — each linking to an article with sourced detail.

Reach for it whenever a feature touches business behaviour:

```bash
cd docs/domain-graph
/graphify query "what feeds the Cost Sheet"
/graphify path "Agent Sales Data" "Payment Listing"
/graphify explain "Matching Rule Engine"
```

Three things to hold onto when you read it:

- **Edges are tagged.** `EXTRACTED` is a stated requirement; `INFERRED` and `AMBIGUOUS` are leads to verify against `sources/`. Only the first is binding.
- **The BRDs are a single-tenant spec.** They never mention the tenant boundary, because multi-tenancy is this platform's addition. Every requirement read from the graph still has to be built tenant-scoped — the invariants below are not negotiable against it.
- **The graph is the DOMAIN; the prototype is the DESIGN.** The graph answers what a screen must do and which rules bind it. It does not carry the design, and `/graphify query` will never tell you a form marks mandatory fields with a red asterisk or that Status is a segmented switch rather than a dropdown. Open `sources/Clickable_Prototype.html 3.html` and read the markup and CSS for the screen you are building — `web-app/.claude/rules/prototype-fidelity.md` has the extraction snippets and the conventions checklist. Reading the graph for a field list and then building to your own conventions produces a screen with the right data that looks nothing like the design; that is how the User Management form had to be redone.

The graph describes the domain. The `docs/` in each repo describes the build. Where they
disagree about *what the product does*, the BRD wins.

## Invariants that span both repos

1. **Tenant identity is server-derived** — subdomain plus JWT claim, verified to agree. The client never names its own tenant. `app.` is the platform host and resolves no tenant; an unknown slug is a 404. See `server-app/docs/edge.md`.
2. **No cross-tenant anything** — no query, no cache key, no queue message without a tenant group id.
3. **The connection budget is real arithmetic**, not a guideline. See `server-app/docs/multi-tenancy.md`.
4. **`openapi.json` is the contract.** The server emits it; the web repo commits it and generates its client from it. Neither side hand-writes the other's types.
5. **Migrations fan out to N tenant databases.** A deploy is not done until every tenant reaches the target `schema_version`.
6. **The SPA and the API are same-origin behind one CloudFront distribution** — `/api/*` to the ALB, `/*` to S3. No CORS, no preflight, first-party refresh cookie. The ALB is never addressed by a browser.

## End-to-end tests: the cases are the source of truth

A third repository, **[e2e-app/](e2e-app/)**, holds the
browser suite. It is cloned here and gitignored like the other two, and it is
not wired to any pipeline — a run is started by hand.

**`cases/` is the product. `tests/` is derived from it.**

`cases/**/*.md` are English tables a tester can read and change without opening
a script: what a user does, and what they must see. Every case carries an ID
(`MAS-CN-004`, `JRN-AGT-009`), and every Playwright test puts that ID at the
front of its title. That ID is the only join between the two directories.

```
| ID | Case | Steps | Expected |
|----|------|-------|----------|
| MAS-CN-004 | A duplicate code is refused | Create `G-DUP`. Create it again. | The dialog stays open and says the code is in use. |
```

### The loop, and which way it runs

1. **A tester edits `cases/`** — rewords an expectation, adds a row, marks one
   `SKIP` with a reason, deletes one that no longer describes the product.
2. **`pnpm cases:check`** reports every difference: a case with no script, a
   script with no case, an ID defined twice. It runs as part of that repo's
   `pnpm gate`, so the two cannot drift quietly.
3. **Claude changes the scripts to match**, in a commit naming the IDs that
   moved.

**Never edit a case to match a script.** That inverts the direction and makes
the automation the specification again, which is the whole thing this
arrangement prevents. If a case is wrong, it is wrong in `cases/` and a human
decides what it should say.

A case describes behaviour, never mechanism: no selectors, no routes, no
endpoints, no test ids. Those live in the script, where they can change without
anyone re-reading the case.

### Working on the suite

```bash
cd e2e-app
E2E_PROJECT=app-mine E2E_PORT_OFFSET=300 pnpm e2e:up   # in server-app
pnpm test:ui                  # watch it, step by step, re-run one test
pnpm test:headed              # a real browser window
bash scripts/run-in-container.sh   # the run a result is judged on
```

Two things that cost a day each before they were written down:

- **The stack is per session.** `docker-compose.e2e.yml` is isolated from the
  shared local stack and NOT from other Claude sessions; two sessions on the
  same ports means one session's worker eats the other's queue messages, and
  the symptom is a job that never runs. `E2E_PROJECT` plus `E2E_PORT_OFFSET`
  gives a session its own everything.
- **Sessions cannot be saved and replayed.** Refresh tokens rotate, so
  Playwright's `storageState` is good for exactly one browser context; the
  second replays a revoked token and lands on the sign-in screen. The suite
  signs in once per worker and shares the live context instead.

## Every feature follows the workflow

`<repo>/docs/feature-workflow.md` in whichever repo you are in. **No "small change" exemption.** The short version:

1. **Worktree per feature**, and `pnpm install` inside it — step zero, ~1.2s. Skip it and the lint hook silently stops working.
2. **Both halves.** A feature spans frontend and backend. A backend endpoint with no UI is half a feature.
3. **Domain graph before designing** — `cd docs/domain-graph && /graphify query "..."` for what the feature must do. There is no code graph yet, so `/graphify query` inside a repo will find nothing; build one with `/graphify .` there first if you want one.
4. **`pnpm gate` before every PR** — lint, typecheck, unit tests. Identical to `buildspec.yml`.
5. **Write the case down.** Anything a user would notice — a new screen, a changed refusal, a control that no longer exists — is a CASE, and cases live in `e2e-app/cases/` on the same `feat/<name>` branch as the code. **The case comes first and the script follows**, never the reverse; `pnpm cases:check` failing after a case edit is the SIGNAL telling you which scripts have to move, not an error to work around. Removing a feature means deleting its cases first — see `feat/remove-re-registration`. A case describes behaviour, never a selector, a route or an endpoint. Step 9c in both `feature-workflow.md` files.
6. **Run what you built.** A green gate proves the code compiles and its assertions hold; it cannot see a dropdown clipped to one option, a form five pixels out of alignment, or an expand button that does nothing. Exercise the API with curl and drive the screens in a browser — **every** functional and visual defect in User Management was found that way and **none** by a passing test. Both `feature-workflow.md` files have the step and the traps.
7. **Indexes, caching, and query cost decided during the feature**, not retrofitted.
8. **Multi-tenant load test**, not single-tenant: quiet-tenant p95 < 500ms while a noisy tenant floods.
9. **Leak probe** for anything long-lived: RSS growth < 50MB / 10min.

## Enforcement layers

| Layer | Scope |
|---|---|
| `PostToolUse` hook | Lints each edited file, resolving the owning repo from its path |
| `.claude/rules/*.md` | Per-repo, path-scoped; auto-loads only when Claude touches matching files |
| `Stop` hook | Blocks the turn while typecheck fails in any repo with changes |
| `Stop` hook (hotfix) | Merges `hotfix:` commits down `.claude/hotfix-chain` — **locally, never pushed** |

Advisory by necessity: the load test, the leak probe, and design judgement about the connection budget. Those live in each repo's `docs/feature-workflow.md`.

## Hotfixes

A fix committed on a stable branch has to reach the branches below it, or the next release quietly reintroduces the bug. `.claude/hooks/hotfix.sh` does that at the end of any turn — **but only in a repo that has a `.claude/hotfix-chain`, and none does yet.** Arm it per repo, having chosen the order deliberately:

```bash
cp .claude/hotfix-chain.example .claude/hotfix-chain   # then edit the order
```

```
release ──► uat ──► master        # most stable first; the example's default
```

- **Only `hotfix:` commits move.** Subject must start with `hotfix:`, `hotfix(scope):`, or `hotfix!:`. Everything else is invisible to the hook, which is what keeps it from shuffling feature work between branches.
- **Local only.** It merges; it never pushes, fetches, or deploys. Pushing the propagated branches is yours, and that push is what triggers a pipeline once one exists.
- **A conflict stops the cascade** at that branch and leaves the merge aborted, so nothing below it ends up carrying half a fix. The hook prints the two commands to finish by hand.
- **It refuses to run on a dirty tree** and skips any branch checked out in a feature worktree — it says so rather than working around it. Run it from the main checkout.
- **Off until you create the chain file**, and silent in a feature worktree — propagation is a main-checkout job. Missing branches are skipped without comment, so an armed chain stays quiet until its branches exist. Deleting the chain file switches the hook off again.

One thing to settle before pushing any of these branches: `server-app/docs/cicd.md` documents artifact **promotion** — one merge to `main`, one immutable image walking dev → uat → prod. A branch per environment is a different model. Both cannot be the source of truth about what is deployed where.

## Deferred decisions

[docs/deferred-decisions.md](docs/deferred-decisions.md) — things deliberately not built
yet, and requirements gaps found against the BRDs, each with the reasoning and what has
to be true before it gets picked up. Check it before designing anything that touches
roles, approvals, or reports; add to it rather than leaving a decision in a chat log.

## Conventions

Both repos: TypeScript strict, ESLint flat config with architectural rules **and file-size limits** as errors, and a `PostToolUse` hook that lints every file Claude touches. Domain questions go to [`docs/domain-graph/`](docs/domain-graph/) rather than a broad search.

`STYLE_GUIDE.md` exists in both repos as a stub. **Until it is written, the ESLint and Prettier configs are the style guide.**

Environments are `dev`, `uat`, `prod` — separate AWS accounts and separate Terraform state.

## CI/CD

AWS-native: CodePipeline + CodeBuild, source from GitHub via CodeStar Connection. **No GitHub Actions.** The pipeline is not provisioned yet, so **`pnpm gate` is the interim PR gate**.

## Local environment

`server-app`: `pnpm local:up && pnpm local:verify` (13 checks, verified passing). Postgres, PgBouncer in transaction mode, Valkey, ElasticMQ, MinIO — on offset ports in the 5xxxx range.

**What local cannot tell you:** SQS fair-queue behaviour is server-side AWS and is not emulated by anything free. Tenant starvation is invisible locally and is verified in uat against real SQS only.

## Clean up what you started — every time

**When a task is done, stop every app process and docker stack YOUR session started.**
Many sessions run on this machine at once, and each isolated stack (`E2E_PROJECT=…`)
is six containers plus an API, workers and a Vite server. Left running, they exhaust
memory and slow every other session down.

- **Before you report done:** kill the API, workers and Vite you started — by the
  listening pid, after checking `/proc/<pid>/cwd` is your checkout (never an unscoped
  `pkill -f`, which kills other sessions' servers and your own shell). Then
  `docker compose -p <your E2E_PROJECT> -f docker-compose.e2e.yml down -v` for any
  isolated stack you brought up.
- **Only your own.** Never stop the shared `app-workspace` stack or another session's
  project. If you find stacks nobody seems to own, list them for the developer
  rather than deleting them.
- **Note it in your final message:** what you stopped, and anything left running on
  purpose (and why).
