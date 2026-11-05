# Manifest: every component of the original harness, and where it lives here

The harness was extracted from a production reference project: a workspace of three repos
(server, web, e2e), and a fork of it built for a second client. This table lists each component,
what it became, and where to find it. "Generic" means rewritten to be
layout- and stack-neutral; "example" means kept verbatim (sanitised) under
`examples/reference-project/` to show the real shape.

## Enforcement

| Original | Here | Form |
|---|---|---|
| `.claude/hooks/lint.sh` (walks up to find ESLint) | `templates/workspace/.claude/hooks/lint.sh` — unit table decides the linter, any language | Generic + example |
| `.claude/hooks/gate.sh` (typecheck in repos with changes; exit 2; `stop_hook_active`) | `templates/.../hooks/gate.sh` — per unit, any typechecker | Generic + example |
| `.claude/hooks/hotfix.sh` + `hotfix-chain.example` | `templates/.../hooks/hotfix.sh` (git roots from units), `hotfix-chain.example` with the promotion-vs-branch warning | Generic + example |
| Identical hook copy at root and in each repo (settings read from session root only) | `bootstrap.sh` copies hooks + a self-only unit table into each repo; explained in `references/enforcement.md` §1 | Generic |
| `.claude/settings.json` wiring | `templates/.../settings.json`; merged by `install.sh` | Generic |
| Repo names hardcoded in scripts | `harness.conf` + `harness.units` (INI blocks) | New |
| `.claude/rules/*.md` with `paths:` (7 server, 6 web) | `templates/repo/.claude/rules/_template.md`; all 13 in `examples/reference-project/{server,web}/.claude/rules/` | Template + examples |
| ESLint architectural rules (restricted syntax/imports, cycles, size, sonarjs DRY, type safety) | `references/stacks.md` §2 (any linter); `examples/.../server/eslint.config.mjs`, `web/eslint.config.mjs` | Generic + examples |
| `scripts/gate.sh` server (lint, typecheck, unit, openapi fresh, migration required, Trivy) | `templates/repo/scripts/gate.sh`; `examples/.../server/scripts/gate.sh` | Template + example |
| `scripts/gate.sh` web (generated client fresh, bundle budget) | Same template (budget step); `examples/.../web/scripts/gate.sh` | Template + example |
| `scan.sh` (Trivy, pinned, machine-wide cache, `--ignore-unfixed` rationale) | `examples/.../{server,web}/scripts/scan.sh`; rationale in `references/enforcement.md` §4 | Example |
| `ci/check-migration-required.sh`, `ci/check-index-drift.sh`, `gate-db.sh` | `examples/.../server/scripts/` | Example |
| Workspace and repo `CLAUDE.md` (invariants, hard rules → linked docs, enforcement table, working agreement) | `templates/workspace/CLAUDE.md.tmpl`, `templates/repo/CLAUDE.md.tmpl`; originals in `examples/.../` | Template + examples |
| CLAUDE.md loading behaviour (ancestors at launch, nested on demand, not re-injected after `/compact`, `@import`) | `references/enforcement.md` §1 | Doc |
| STYLE_GUIDE stub ("lint config is the style guide") | `references/enforcement.md` §1 | Doc |
| Project-local skill (`web/.claude/skills/shadcn`) | Mentioned in `references/enforcement.md` §1 | Doc |
| Code graph (graphify in repo, GitNexus PreToolUse hook) | `references/enforcement.md` §1, optional | Doc |

## Workflow

| Original | Here | Form |
|---|---|---|
| `scripts/feature-start.sh` (worktree per repo, install, `.env` copy, CLAUDE.md + hooks copy) | `templates/workspace/scripts/feature-start.sh` — any layout; also covers the e2e repo the original skipped | Generic + example |
| `scripts/feature-end.sh` (never forces) | `templates/.../feature-end.sh` | Generic + example |
| `scripts/bootstrap.sh` | `templates/.../bootstrap.sh` (workspace layout) | Generic + example |
| `docs/feature-workflow.md` server + web, PR checklist | `templates/workspace/docs/feature-workflow.md` (merged, stack-neutral, clarify step added); originals in `examples/` | Template + examples |
| "No small-change exemption"; cosmetic changes get a targeted check | `references/opinions.md` #6 | Doc |
| Both halves of a feature | Opinion #7, workflow §5 | Doc |
| Speed every feature (index + EXPLAIN, cache policy, Server-Timing, nextCursor, one request, lazy routes, bundle budget) | Workflow §5b | Template |
| Expand-then-contract migrations | Workflow §5c | Template |
| Observability per feature (traceId, context propagation, no tenant dimension, alarms) | Workflow §9b | Template |
| Unit tests: mock boundaries not the DB; MSW from generated types; query by role | Workflow §6 | Template |
| Exercise endpoints against the running stack; LOOK at the screen; locator traps | `references/cases-and-verification.md` §3, §5 | Doc |
| Multi-tenant load test (quiet-tenant thresholds) | `references/cases-and-verification.md` §6; `examples/.../server/loadtest/multi-tenant.js` | Doc + example |
| Leak probe (RSS < 50 MB / 10 min, flat object counts; fail without k6) | Same §6; `examples/.../server/scripts/leak-probe.sh` | Doc + example |
| `local:up` / `verify-local.sh` (behaviour, not `ps`) | Same §5; `examples/.../server/scripts/verify-local.sh` | Doc + example |

## Requirements and design

| Original | Here | Form |
|---|---|---|
| `docs/domain-graph/` (sources untouched, graphify graph, wiki, EXTRACTED/INFERRED/AMBIGUOUS) | `references/requirements-and-design.md`; `templates/workspace/docs/README.requirements.md`; `examples/.../workspace/domain-graph-README.md` | Doc + template + example |
| "Graph is the domain, prototype is the design" | Same, §4; opinion #5 | Doc |
| `prototype-fidelity.md` (extraction snippets, conventions) | `examples/.../web/.claude/rules/prototype-fidelity.md` | Example |
| Existing screens beat prototype one-offs | `references/requirements-and-design.md` §4 | Doc |
| "BRDs are single-tenant; build tenant-scoped" | Same §5; `references/contradictions.md` worked example | Doc |
| BRD wins on what, build docs win on how | Same §5 | Doc |

## Cases and e2e

| Original | Here | Form |
|---|---|---|
| `cases/**/*.md` convention (IDs, behaviour not mechanism, SKIP) | `templates/e2e/cases/README.md`, `screens/example.md`; originals in `examples/.../e2e/cases/` | Template + example |
| `tools/cases-check.mjs` | `templates/e2e/tools/cases-check.mjs` — configurable dirs, extensions, ID pattern; any test framework; SKIP reasons naming other IDs no longer count as definitions | Generic + example |
| `tools/coverage-report.mjs` | `examples/.../e2e/tools/` | Example |
| Case-first, same branch name across repos, delete cases first when removing | `references/cases-and-verification.md` §1 | Doc |
| Run in the CI-shaped container | Same §3; `examples/.../e2e/scripts/run-in-container.sh` | Doc + example |
| Isolated stack per session (`E2E_PROJECT`, `E2E_PORT_OFFSET`, own queues) | Same §4; `examples/.../server/scripts/e2e-up.sh`, `docker-compose.e2e.yml` | Doc + example |
| Session replay / storageState trap; in-app navigation; mail-provider blocking; curl sign-in revoking the suite | Same §3 | Doc |

## Records

| Original | Here | Form |
|---|---|---|
| `docs/deferred-decisions.md` | `templates/workspace/docs/deferred-decisions.md`; excerpt in `examples/` | Template + example |
| Defect CSV tracker with "Verified How" | `templates/workspace/docs/defects.csv` | Template |
| Open questions (was implicit in the decision log and chat) | `templates/workspace/docs/open-questions.md`, `references/contradictions.md` | New |
| Memory (one fact per file, MEMORY.md index, 90+ notes) | `templates/memory/`; `references/records-and-parallel-work.md` §1 with the recurring traps | Template + doc |
| "Ask which product a defect list is for" | SKILL.md Intake; records §4 | Doc |

## Parallel work and housekeeping

| Original | Here | Form |
|---|---|---|
| Parallel agents by default; supervisor owns git and migrations | records §5; opinion #13 | Doc |
| Stage by path; never checkout an agent-edited file | records §5 | Doc |
| Migration lane is ordering, not scheduling | records §5 | Doc |
| Pipelines supersede; keep pushes serial | records §5 | Doc |
| Clean up what you started; kill by listening pid; never unscoped `pkill -f` | records §6; SKILL.md ground rules; `templates/memory/kill-server-by-listening-pid.md` | Doc + template |

## Deliberately NOT included

| Component | Why |
|---|---|
| Continue-nudge Stop hook, Telegram notifier | Personal session tooling, not part of the delivery method |
| Caveman output style | Personal preference |
| `settings.local.json`, triage scratch files, defect batches | Project-specific and personal |
| Test identities, PAN/IFSC/account data, AWS account and VPC ids, credentials | Sensitive; fixture emails replaced with `example.test` |
| Product-specific seeders, migrations, exercise scripts, Terraform | Not reusable; the pattern is in the references |
