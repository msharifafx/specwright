# Examples

Fourteen real files from the multi-tenant platform Specwright was extracted
from, with names removed. Each is here because it shows something the
templates cannot: how a mature version reads after months of use.

Read them for **shape** — how a rule is phrased, how a script explains the
failure it prevents. **Do not copy their rules** into another project: they
encode that project's stack (NestJS, Drizzle, PostgreSQL per tenant, React,
Playwright, AWS) and its invariants. The scripts are bash because that project
ran on Linux only; Specwright's own scripts are Node and cross-platform.

| File | Why it is here |
|---|---|
| `workspace/CLAUDE.md` | A root instructions file at full size: repos, how rules load, where requirements live, invariants, the cases loop, the workflow, enforcement layers, clean-up |
| `server/CLAUDE.md` | A unit instructions file: stack table, hard rules grouped by topic, each linking the doc that explains it |
| `server/eslint.config.mjs` | Architecture as lint errors — boundaries, one door for dangerous handles, size limits, narrow DRY — each ban saying why |
| `server/.claude/rules/database.md` | A path-scoped rule for the riskiest code: transactions, indexes, pagination |
| `server/.claude/rules/jobs.md` | A short path-scoped rule: queues, idempotency, fairness |
| `web/.claude/rules/prototype-fidelity.md` | How to build a screen from the prototype's markup, with extraction snippets |
| `server/docs/feature-workflow.md` | The full feature loop and PR checklist as one team actually ran it |
| `server/scripts/gate.sh` | A complete gate: lint, typecheck, tests, contract freshness, migration check, vulnerability scan |
| `server/scripts/e2e-up.sh` | One port offset and one project name giving each session an isolated stack |
| `server/loadtest/multi-tenant.js` | A load test that floods one tenant and asserts on the quiet ones |
| `server/scripts/leak-probe.sh` | A leak probe judged on RSS growth and flat object counts |
| `e2e/cases/README.md` | The cases contract a tester works from |
| `e2e/cases/screens/masters-code-and-name.md` | A real case file: behaviour, never mechanism |
| `workspace/deferred-decisions.excerpt.md` | The opening of a decision log and its first entries |
