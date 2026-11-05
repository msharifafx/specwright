# Examples: the reference project's real files

Sanitised copies from the reference project (NestJS + Drizzle + PostgreSQL per tenant,
React + TanStack, Playwright; three repos in one workspace). Read them for
**shape** — how a rule is phrased, how a hook explains itself, how a gate is
ordered. Do not copy their rules into another project: they encode that
project's invariants (tenancy, connection budget, AWS) and stack.

| File | Shows |
|---|---|
| `workspace/CLAUDE.md` | A root instructions file: repos, loading behaviour, domain graph, invariants, cases loop, workflow, enforcement layers, hotfixes, clean-up |
| `workspace/README.md` | How the workspace is explained to a person |
| `workspace/.claude/` | Original hooks (repo names hardcoded) and settings |
| `workspace/scripts/` | Original feature-start/end and bootstrap |
| `workspace/domain-graph-README.md` | How the requirements graph is introduced |
| `workspace/deferred-decisions.excerpt.md` | The decision log's opening and first entries |
| `server/CLAUDE.md` | A unit instructions file: stack table, hard rules by topic each linking a doc, enforcement, working agreement |
| `server/eslint.config.mjs` | Architecture as lint errors, each ban explaining the failure it prevents |
| `server/.claude/rules/` | Seven path-scoped rules: connections, database, DRY, jobs, observability, performance, storage/mail/i18n |
| `server/docs/feature-workflow.md` | The full backend loop and PR checklist |
| `server/scripts/gate.sh` | The PR gate CI runs verbatim |
| `server/scripts/scan.sh` | A pinned scanner with a machine-wide cache and a clearable policy |
| `server/scripts/ci/` | Migration-required and index-drift checks |
| `server/scripts/gate-db.sh` | Database-backed checks kept out of the fast gate |
| `server/scripts/verify-local.sh` | Verifying a local stack by behaviour |
| `server/scripts/e2e-up.sh`, `server/docker-compose.e2e.yml` | One offset, every port: an isolated stack per session |
| `server/scripts/leak-probe.sh` | Leak probe with RSS and object-count criteria |
| `server/loadtest/multi-tenant.js` | Noisy-neighbour load test asserting on quiet tenants |
| `web/CLAUDE.md`, `web/eslint.config.mjs` | The frontend counterparts, including design-system lint |
| `web/.claude/rules/` | Six rules, including `prototype-fidelity.md` with extraction snippets |
| `web/docs/feature-workflow.md` | Frontend loop: look at the screen, locator traps, bundle budget |
| `web/scripts/gate.sh` | Generated-client freshness and bundle budgets |
| `e2e/README.md`, `e2e/SETUP.md` | Introducing a browser suite to a tester, from nothing |
| `e2e/cases/` | The cases contract and one real screen file |
| `e2e/tools/` | The original cases check and coverage report |
| `e2e/scripts/run-in-container.sh` | Judging results in the CI-shaped container |
| `e2e/playwright.config.ts` | Suite configuration |
