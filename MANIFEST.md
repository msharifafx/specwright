# Manifest

Every component of the delivery setup Specwright was extracted from, what it
became, and where it lives. "Generic" = rewritten to be layout-, stack- and
OS-neutral; "example" = a real file kept (names removed) in `examples/`.

## Enforcement

| Original | Specwright | Form |
|---|---|---|
| Per-edit lint hook (bash, found ESLint by walking up) | `templates/workspace/.claude/hooks/lint.mjs` — the unit in `specwright.ini` decides the linter; findings reach the agent (exit 2) | Generic |
| Stop-hook typecheck (bash, uncommitted changes only) | `hooks/gate.mjs` — also checks commits made during the turn (`turn-start.mjs` records HEAD); a slow check blocks instead of passing | Generic |
| Hotfix propagation (bash, switched branches in the live checkout) | `hooks/hotfix.mjs` — moves refs with `git merge-tree`, never touches a working tree; non-blocking report | Generic |
| Hook copy in every repo (settings read from session root only) | `scripts/bootstrap.mjs`; `references/enforcement.md` §1 | Generic |
| Repo names hardcoded in scripts | `.claude/specwright.ini` (project, units, gate) | New |
| Path-scoped rules (`paths:` frontmatter), 13 in the original | `templates/repo/.claude/rules/_template.md`; three real ones in `examples/` | Template + examples |
| ESLint architecture rules | `references/stacks.md` §2 for any linter; `examples/.../server/eslint.config.mjs` | Generic + example |
| PR gate scripts (lint, typecheck, tests, contract fresh, migration check, scan, bundle budget) | `scripts/gate.mjs` running `[gate]` steps; step list in `references/enforcement.md` §4; `examples/.../server/scripts/gate.sh` | Generic + example |
| Root and unit `CLAUDE.md` | `templates/workspace/CLAUDE.md.tmpl`, `templates/repo/CLAUDE.md.tmpl`; originals in `examples/` | Template + examples |
| CLAUDE.md loading behaviour, style-guide stub, project-local skills, code graph | `references/enforcement.md` §1 | Doc |

## Workflow

| Original | Specwright | Form |
|---|---|---|
| `feature-start.sh` / `feature-end.sh` / `bootstrap.sh` | `scripts/*.mjs`, any layout; the e2e repo the original skipped is covered | Generic |
| Server + web feature workflow docs, PR checklist | `templates/workspace/docs/feature-workflow.md` (merged, clarify step added, platform steps marked); `examples/.../server/docs/feature-workflow.md` | Template + example |
| Speed, migrations, observability, test-double rules per feature | Feature workflow §5b, §5c, §6, §9b | Template |
| Exercise the API, look at the screen, locator traps | `references/cases-and-verification.md` §3, §5 | Doc |
| Multi-tenant load test, leak probe, isolated stack | Same §4, §6; `examples/.../server/{loadtest,scripts}/` | Doc + examples |
| One level of ceremony for every project | `references/tiers.md`: lite / standard / platform | New |

## Requirements and design

| Original | Specwright | Form |
|---|---|---|
| Domain graph from the BRDs and prototype (graphify) | Required; `references/requirements-and-design.md`; `templates/workspace/docs/README.requirements.md` | Doc + template |
| Prototype fidelity, shared components beat one-offs | Same §4; `examples/.../web/.claude/rules/prototype-fidelity.md` | Doc + example |
| "The BRDs are single-tenant; build tenant-scoped" | Same §5; `references/contradictions.md` | Doc |
| Contradictions found ad hoc | `references/contradictions.md`, the open-questions register, phase 2 of setup | New |

## Cases and e2e

| Original | Specwright | Form |
|---|---|---|
| Cases convention (IDs, behaviour not mechanism, SKIP) | `templates/e2e/cases/`; `examples/.../e2e/cases/` | Template + examples |
| `cases-check.mjs` | `templates/e2e/tools/cases-check.mjs` — configurable, any test framework | Generic |
| Case first, same branch across repos, delete cases first | `references/cases-and-verification.md` §1 | Doc |
| E2E traps (session replay, in-app navigation, mail provider limits) | Same §3 | Doc |

## Records and parallel work

| Original | Specwright | Form |
|---|---|---|
| Decision log | `templates/workspace/docs/deferred-decisions.md`; excerpt in `examples/` | Template + example |
| Defect CSV with "Verified How" | `templates/workspace/docs/defects.csv` | Template |
| Personal agent memory | Team lessons in the repo: `docs/lessons/INDEX.md`, imported by `CLAUDE.md` | Changed |
| Parallel agents, supervisor owns git and migrations, stage by path, clean up by listening pid | `references/records-and-parallel-work.md` | Doc |

## Deliberately not included

| Component | Why |
|---|---|
| Session notifier, continue-nudge hook, output-style preferences | Personal tooling, not the method |
| Product-specific seeders, migrations, infrastructure, test data | Not reusable; the pattern is in the references |
| Names of the product, client, company, vendors, people, domains, accounts | Removed for publication |
