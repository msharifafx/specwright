# Enforcement: instructions, hooks, rules, gate

Four layers, so no rule depends on being remembered. This file explains how
each layer works in Claude Code, the traps in each, and how to fill them.

## Contents

1. How instruction files load
2. Hooks: lint, typecheck, hotfix
3. Path-scoped rule files
4. The gate
5. What no layer can enforce

---

## 1. How instruction files load

- `CLAUDE.md` files in the session's directory and its **ancestors** load at
  launch. A `CLAUDE.md` in a **subdirectory** loads on demand, the first time
  the agent reads a file in that subtree. So unit rules arrive with unit code,
  and a root session stays light.
- Nested `CLAUDE.md` files are **not re-injected after `/compact`**; they load
  again the next time a file there is read. To pin one for a whole session,
  add `@path/to/CLAUDE.md` to the root file (cost: it occupies context from
  launch).
- `.claude/settings.json` (and therefore hooks) is read from the **session's
  project root only**. A settings file in a subdirectory is never loaded. That
  is why an identical hook copy sits wherever a session may start, and each
  hook finds the owning unit itself.
- Other agents: `AGENTS.md` is read by several tools. If a project already
  standardises on it, keep the content there and make `CLAUDE.md` import it
  (`@AGENTS.md`).

What goes in the root instructions file (template:
`templates/workspace/CLAUDE.md.tmpl`):

1. What the product is, in one paragraph.
2. The units / repos and what each holds.
3. The invariants (from the interview).
4. Where requirements, decisions and open questions live, and the rule that
   open contradictions are not built on.
5. The feature loop in eight lines, pointing at the full doc.
6. How to run it locally.
7. Rules for working beside other sessions.

What goes in a unit instructions file (template: `templates/repo/CLAUDE.md.tmpl`):
the stack table, hard rules grouped by topic each linking its long doc, the
enforcement table, and the working agreement (never disable a hook; change a
rule and its doc together; when a rule conflicts, the rule wins and you say so).

Keep each rule to a line or two plus its reason. The agent reads the file on
every session.

**Style guide.** Until a written style guide exists, the lint and formatter
configs ARE the style guide — executable, and unable to drift from
themselves. Say so in the unit instructions file rather than leaving an empty
STYLE_GUIDE.md that implies otherwise.

**Project-local skills.** A unit may carry its own skills in
`.claude/skills/` (the reference web repo carried a `shadcn` skill for its
component library). Install one when the team relies on a library with
conventions an agent would otherwise guess.

**Code graph (optional).** A code knowledge graph (`/graphify .` inside a
repo, or GitNexus with a PreToolUse hook that enriches searches) answers
"what calls this" faster than grep — useful for the feature loop's
enumerate-callers step. Refresh it after large merges; a stale graph misleads.

## 2. Hooks

Wired in `.claude/settings.json` (template provided). All read
`.claude/harness.conf` and `.claude/harness.units` through `hooks/_conf.sh`.

| Hook | Event | Does | Blocks? |
|---|---|---|---|
| `lint.sh` | PostToolUse on Edit/Write/MultiEdit | Finds the unit owning the file (longest path match), runs its `lint` command on that file | Never — prints findings for the agent; says "NOT linted" loudly when the linter is missing |
| `gate.sh` | Stop | Runs `typecheck` in every unit with uncommitted changes in its extensions | Exit 2 with errors on stderr |
| `hotfix.sh` | Stop | Merges `hotfix:` commits down `.claude/hotfix-chain` locally | Exit 2 only to report what moved |

Traps that cost real time:

- **Exit codes.** Exit 2 blocks and feeds stderr back to the model. Exit 1 is
  a hook error and is ignored, so a gate that exits 1 gates nothing.
- **`stop_hook_active`.** True on the turn a Stop hook already blocked. Without
  the check the hook re-fires forever.
- **Non-interactive shells.** Hooks do not read `.bashrc`. A red "typecheck
  failed" can mean the hook could not find `pnpm`/`poetry`/`go`. The hooks run
  commands through `bash -lc`; if a toolchain is still missing, put its path in
  the login profile. Before chasing a red hook, run the command yourself.
- **Fresh worktrees.** No dependencies → the linter is missing → the hook says
  "NOT linted". That is why `feature-start.sh` installs before anything else.
- **`jq` required.** Without it the hooks cannot read their input; they say so.

The hotfix hook is **inert** until a repo has `.claude/hotfix-chain` (copy the
example). Only commits whose subject starts `hotfix:` / `hotfix(scope):` /
`hotfix!:` move; it refuses a dirty tree, skips branches checked out in a
worktree, stops the cascade on a conflict, never pushes. Do **not** arm it if
CI promotes one artifact through environments: the branches and the pipeline
would disagree about what is deployed where. That is an interview question.

## 3. Path-scoped rule files

`.claude/rules/<topic>.md` with frontmatter:

```yaml
---
paths:
  - 'src/db/**/*.ts'
  - '**/*.repository.ts'
---
```

The file loads only when the agent touches a matching file. One topic per
file. Template: `templates/repo/.claude/rules/_template.md`. Thirteen real
examples, server and web, are in `examples/reference-project/*/.claude/rules/`:

| Server | Web |
|---|---|
| connections (pool budget) · database (transactions, indexes, keyset pagination) · dry · jobs (queues, idempotency) · observability (trace ids, bounded metric dimensions) · performance (cache policy, Server-Timing) · storage, mail and i18n | components (forms, controls, accessibility) · data-fetching (query keys, no waterfalls) · dry · i18n and files · performance (lazy routes, bundle budget) · prototype fidelity (extracting a screen from the prototype) |

Good topics are the ones where a mistake is silent until production:
concurrency, isolation, money, caching, migrations, performance at volume,
accessibility, the design system.

## 4. The gate

One script per unit or one at the root (template:
`templates/repo/scripts/gate.sh`), cheapest step first, **run identically by
CI**:

1. Lint (whole unit)
2. Typecheck
3. Unit tests
4. Contract fresh (regenerate, `git diff --exit-code` — so it must be
   committed, not just regenerated)
5. Migration required (schema changed without a migration → fail; ask the
   generator, do not just look for the presence of a file)
6. Budget (frontend: entry ≤ ~250 KB gz, route chunk ≤ ~150 KB gz)
7. Vulnerability and secrets scan (fixable HIGH/CRITICAL only; binary and
   database cached machine-wide so a new worktree costs nothing)
8. Cases check, where the cases live in this unit

Separate, named, scripted commands for what is too slow or needs
infrastructure: database-backed checks (index drift), load test, leak probe,
the end-to-end suite. The gate prints that they were not run.

Real gates: `examples/reference-project/server/scripts/gate.sh` and
`examples/reference-project/web/scripts/gate.sh`; scanner wrapper `scan.sh`;
migration check `ci/check-migration-required.sh`; index drift
`ci/check-index-drift.sh`.

## 5. What no layer can enforce

The load test, the leak probe, running the feature yourself, whether a derived
value still matches a recompute, and design judgement about cost. Those live
in the feature workflow and the PR checklist, and in review.
