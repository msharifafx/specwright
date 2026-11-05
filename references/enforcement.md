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
8. The team lessons import: `@<lessons_dir>/INDEX.md`. Every session, for
   every developer, starts with the traps the team has already paid for
   (`records-and-parallel-work.md` §1).

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

Wired in `.claude/settings.json` as `node .claude/hooks/<name>.mjs`. They are
plain Node (18+, no dependencies), so they run natively on Windows, macOS and
Linux; the only requirement is `node` on the PATH. All read
`.claude/specwright.ini` through `hooks/lib.mjs`.

| Hook | Event | Does | Blocks? |
|---|---|---|---|
| `turn-start.mjs` | UserPromptSubmit | Records HEAD of every git root the units live in, in `.claude/.specwright/` (self-ignoring) | Never |
| `lint.mjs` | PostToolUse on Edit/Write/MultiEdit | Finds the unit owning the file (longest path match), runs its `lint` command on that one file | Clean → exit 0, silent. Findings → exit 2 with them on stderr, so the **agent** sees them at once. Linter missing → exit 2 with "NOT linted" |
| `gate.mjs` | Stop | Runs `typecheck` in every unit touched this turn — uncommitted changes **and** commits made since the turn began — in its extensions | Exit 2 with the errors; a typecheck that runs past `typecheck_timeout` also blocks, with a message to make it incremental |
| `hotfix.mjs` | Stop | Carries `hotfix:` commits down `.claude/hotfix-chain` by moving refs | Never — reports through a `systemMessage` |

Traps that cost real time:

- **Exit codes.** Exit 2 feeds stderr back to the agent (for Stop it also
  blocks the turn from ending). Exit 1 is a hook error and is ignored, so a
  gate that exits 1 gates nothing. A PostToolUse hook that prints to stdout
  and exits 0 is seen by the person in the transcript, **not** by the agent —
  which is why `lint.mjs` exits 2 on findings.
- **`stop_hook_active`.** True on the turn a Stop hook already blocked. Without
  the check the hook re-fires forever.
- **The platform shell.** Unit commands (`lint`, `typecheck`, `install`, gate
  steps) run through the platform shell: `cmd.exe` on Windows, `/bin/sh`
  elsewhere. Write commands that work in both — package-manager scripts
  (`pnpm lint`, `npx tsc`), `&&` rather than `;`, double quotes — or a team
  that develops on Windows will see "NOT linted" while macOS is green.
- **Toolchain not found.** Hooks run without the interactive shell's
  profile. A red "typecheck FAILED" can mean the hook could not find
  `pnpm`/`poetry`/`go`. Before chasing it, run the command yourself; if it
  passes, put the toolchain on the PATH the desktop session inherits.
- **Fresh worktrees.** No dependencies → the linter is missing → "NOT
  linted". That is why `node scripts/feature-start.mjs` installs first.
- **Slow typechecks.** Over the budget, the Stop hook blocks rather than
  passing quietly. Use an incremental mode (`tsc -b`, `mypy --incremental`,
  `cargo check`), or raise `typecheck_timeout` for that unit knowingly.

The hotfix hook is **inert** until a git root has `.claude/hotfix-chain`
(copy the example; platform tier). Only commits whose subject starts
`hotfix:` / `hotfix(scope):` / `hotfix!:` move. It merges with
`git merge-tree --write-tree` and moves the branch ref directly, so **no
working tree ever changes** under an editor or another session. A branch that
is checked out somewhere is never moved behind that checkout's back: the hook
stops there and prints the one command to run in it. A conflict stops the
cascade. It never fetches or pushes, and needs git 2.38+. Do **not** arm it if
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

The `[gate]` section of `.claude/specwright.ini` lists the steps;
`node scripts/gate.mjs` runs them **in order**, cheapest first, through the
platform shell, and stops at the first failure. **CI runs the same command.**

```ini
[gate]
lint = pnpm -r lint
typecheck = pnpm -r typecheck
unit tests = pnpm -r test
contract = pnpm openapi:generate && git diff --exit-code openapi.json
migrations = pnpm db:check
scan = trivy fs --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed .
cases = node e2e/tools/cases-check.mjs
```

Typical steps:

1. Lint (whole unit)
2. Typecheck
3. Unit tests
4. Contract fresh (regenerate, `git diff --exit-code` — so it must be
   committed, not just regenerated)
5. Migration required (schema changed without a migration → fail; ask the
   generator, do not just look for the presence of a file)
6. Budget (frontend: entry ≤ ~250 KB gz, route chunk ≤ ~150 KB gz)
7. Vulnerability and secrets scan (fixable HIGH/CRITICAL only; pin the
   scanner and cache its database machine-wide so a new worktree costs nothing)
8. Cases check, where the project has cases

Separate, named commands for what is too slow or needs infrastructure:
database-backed checks (index drift), load test, leak probe, the end-to-end
suite. The gate prints that they were not run.

The reference project's real gates, scanner wrapper and migration check are
listed in `examples/README.md`.

## 5. What no layer can enforce

The load test, the leak probe, running the feature yourself, whether a derived
value still matches a recompute, and design judgement about cost. Those live
in the feature workflow and the PR checklist, and in review.
