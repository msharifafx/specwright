---
name: shipwright
description: Shipwright — set up, adopt or run an opinionated AI-assisted delivery harness on any software project — new or existing, any directory layout (single repo, monorepo, workspace of repos), any stack. Interviews the team, hunts contradictions between requirements, design, code and config, asks the questions that need a human, then installs guardrails (agent instruction files, lint and typecheck hooks, path-scoped rules, a CI-identical gate, feature worktrees, cases-as-specification, decision log, open-questions register, memory). Use whenever someone wants to start a project from a BRD/PRD, onboard an existing codebase for Claude Code, set up CLAUDE.md/hooks/rules, standardise how features go from requirements to production, run a feature through a disciplined loop, triage a new requirements or defect batch for contradictions, or audit a project's AI-delivery setup — even if they do not say "harness".
---

# Shipwright

*Build the vessel before the voyage: guardrails first, then features.*

A method and a kit for taking software from requirements to production with
a coding agent, fast and without the mess. It came from two products built
from signed BRDs to production in three months; `references/cookbook.md` is
the story for humans.

The harness is **opinionated about practice** and **neutral about layout and
stack**. The practices (`references/opinions.md`) are fixed defaults; the
directory structure, languages, frameworks, architecture and tools are the
project's, and the harness adapts to them.

Your most important job is not installing files. It is **finding what the
project's people know that the files do not**: which source is current, what
may never break, where two documents disagree. Ask those questions — only
those — and write every answer where the next session will find it.

## Pick the mode

| The user wants to... | Mode |
|---|---|
| Start a new project (maybe from a BRD/PRD, maybe from nothing) | **Setup** — new |
| Bring an existing codebase under the harness | **Setup** — existing |
| Build a feature / fix a defect in a project that has the harness | **Feature** |
| Process a new requirements document, change request, or defect batch | **Intake** |
| Know what a project's setup is missing | **Audit** — run `scripts/audit.sh <root>` and report |

If unclear, run discovery (step 1 below) first; what you find usually decides it.

---

## Setup (new or existing)

Work through these phases in order. Do not install anything before phase 4:
the interview changes what gets installed.

### 1. Discover — read-only, before asking anything

Answer everything the project can answer itself. `references/interview.md`
§2 has the full checklist; the essentials:

- **Layout and units.** Run `scripts/audit.sh <candidate-root>`. Identify the
  layout (single repo, monorepo, workspace of repos, sibling repos,
  submodules) and the units — directories with their own toolchain.
  `references/layouts.md` says how to recognise each and where the harness
  root goes.
- **Stack per unit.** Manifests, lint/format/typecheck/test commands, the
  commands CI actually runs. `references/stacks.md` maps each practice to its
  tool per ecosystem.
- **What exists already.** Agent instruction files (`CLAUDE.md`, `AGENTS.md`,
  `.cursorrules`, copilot instructions), `.claude/settings.json`, lint
  configs, ADRs/decision records, test suites, CI/CD and the deployment
  model, local environment (compose, devcontainer).
- **Requirements and design.** BRDs, PRDs, prototypes, design links, emails
  that changed scope; their versions and dates.
- **History of pain** (existing projects): reverted commits, hotfixes,
  reopened issues, lint-disable counts.

Then write a short **discovery summary** for the user, in this shape:

```
Layout:        <single repo | monorepo | workspace | ...>, harness root = <path>
Units:         <path> — <stack>; lint/typecheck/test as CI runs them
Exists:        <instruction files, settings, CI + deploy model, records, tests, local env>
Requirements:  <sources with versions and dates>
Missing:       <what the harness would add>
Unsure of:     <what you could not settle — these feed the interview>
```

Dig as deep as the decisions need: enough to fill every line above. When a
line has nothing (a one-commit history, no CI), say "none" rather than
leaving it out. A wrong assumption corrected now costs a sentence.

**Do not trust a command because CI runs it.** Check the configuration it
needs exists (a `tsc` with no tsconfig, a linter with no config, tests with
no test files). A broken CI is a finding, not a source of truth.

### 2. Hunt contradictions

Follow `references/contradictions.md`: collect sources, extract claims with
their references, group by subject, compare, check each against the likely
invariants, check the silences (failure, retry, duplicates, permissions,
volume, deletion). Classify each finding (conflict, supersession, gap,
invariant breach, drift, naming, false alarm).

Write every real finding into the open-questions register (template
`templates/workspace/docs/open-questions.md`), both sides quoted exactly,
with its class, options and a recommendation. Put it at
`<existing docs folder>/open-questions.md` (`docs/open-questions.md` if
there is none) — that becomes `QUESTIONS_FILE` in phase 4. Drift that needs
no stakeholder is still logged, as an FYI entry for the tech lead, so the fix
is visible; it is not asked as a question.

**Instruction files are sources too.** Compare `CLAUDE.md`, `AGENTS.md`,
`.cursorrules` and the like against each other, against the code and against
CI **before** anything merges or imports them. Importing `@AGENTS.md` into a
`CLAUDE.md` that disagrees with it silently makes one side win.
For an existing project include **config vs practice** findings: instruction
files that contradict each other, lint rules disabled hundreds of times, a
README command CI does not run, environment branches beside an
artifact-promotion pipeline.

### 3. Interview — ask what needs a human

Use `references/interview.md` §3 (the question bank, by area, each with a
default) and §4 (how to ask). In short:

- Ask only what changes what gets built; take the stated default otherwise
  and say so in one line.
- Always confirm the starred items: current requirement sources, who decides
  conflicts, the **invariants**, the deployment model.
- Ask the blocking contradictions from phase 2.
- Use the structured question tool (`AskUserQuestion`) when available, at most
  four questions per call, each self-contained, recommended option first.
- Plain language; name the concrete thing; quote both sides of a
  contradiction in the question.

Record each answer where it belongs (`references/interview.md` §5): the
register entry marked ANSWERED, the decision log, the invariants list, the
config. An answer that lives only in chat gets asked again.

If the user cannot answer now: keep the question open, take the recommended
default for what it does not block, and say so in the report.

### 4. Install

0. **New project:** scaffold each unit first — manifest, lint config,
   typecheck config, one source file — so the hooks have something to run.
   Hooks wired to tools that do not exist yet report "NOT linted" on every
   edit.
1. Write the project's `harness.conf` (locations, worktree prefix, gate
   command) and `harness.units` (one INI block per unit: path, exts, lint
   with `{file}`, typecheck, install) from what you found and were told.
   Every location points at **what already exists** in an existing project.
2. Run `scripts/install.sh <harness-root> --conf <file> --units <file>`.
   It writes the hooks, **merges** hook wiring into an existing
   `settings.json`, and never overwrites a project file — templates for
   existing files are saved as `*.harness-new` for you to merge.
3. Gate: `install.sh` places `scripts/gate.sh` at the harness root (or a
   `.harness-new` beside an existing one). Fill its steps per unit, or point
   `GATE_CMD` at the command CI already runs. One command, identical to CI.
4. Workspace of repos: run the installed `scripts/bootstrap.sh` so every repo
   gets its own hook copy (sessions may start inside a repo).

Never restructure the project to fit the harness. Never commit or push unless
the user asks; stage by path when they do.

### 5. Fill — make it the project's own

- **Instructions files.** Fill `CLAUDE.md` from the template (product
  paragraph, units, invariants, requirements location and the rule about open
  contradictions, the feature loop, local environment, working beside other
  sessions). Existing project: merge into the existing file, keep every
  existing rule, and send any rule that conflicts with the harness to the
  register. If the team standardises on `AGENTS.md`, keep content there and
  import it. Per-unit instructions files where units differ in stack or rules.
  `references/enforcement.md` §1.
- **Path-scoped rules.** One `.claude/rules/<topic>.md` per topic where a
  mistake is silent until production (isolation, transactions, money,
  caching, jobs, migrations, performance at volume, the design system,
  accessibility). Template plus thirteen real examples:
  `references/enforcement.md` §3.
- **Architecture lint.** Boundaries, one door for dangerous handles, no
  cycles, size limits, narrow DRY, type safety — in the unit's own linter
  (`references/stacks.md` §2). Existing code with many violations: strict for
  new files, baselined for old, plan in the decision log. Never switch on a
  gate nobody can clear.
- **The gate.** One command per unit or at the root, cheapest step first,
  identical to CI (`templates/repo/scripts/gate.sh`,
  `references/enforcement.md` §4). Slow checks become separate named
  commands.
- **Topic docs.** Short build docs, one topic each, that the hard rules link
  to: architecture, data and migrations, isolation, jobs, caching,
  performance, observability, environments, CI/CD. Existing projects: link
  what exists; write only what is missing and load-bearing.
- **Invariants into enforcement.** Each confirmed invariant gets a lint rule,
  a test, or at least a line in the instructions file with its reason.
- **Requirements.** `REQUIREMENTS_DIR` points at wherever the sources already
  live (`docs/brd/` is fine; a `sources/` subfolder is only for new projects).
  Never move or edit them; build
  the queryable extract (the `graphify` skill if installed, otherwise a
  tagged glossary). `references/requirements-and-design.md`.
- **Cases.** If there is UI or an end-to-end flow: cases directory beside the
  existing e2e tests (or a new e2e unit), the check wired into the gate, a
  first case file for one screen. `references/cases-and-verification.md`.
- **Local stack and verification.** A one-command environment and a verify
  script that exercises behaviour; per-session isolation (project name +
  port offset) where workers or queues exist.
- **Memory.** Seed the agent's memory with notes for traps already known
  (`templates/memory/`).
- **Departures.** Any opinion the project chose not to follow goes into the
  decision log with its reason (`references/opinions.md`).

### 6. Verify

- `scripts/audit.sh <root>` — nothing missing that was meant to exist; no
  unfilled `__PLACEHOLDERS__`; no unmerged `*.harness-new`.
- Feed the hooks synthetic input from the harness root:
  `echo '{"tool_input":{"file_path":"<abs path of a real source file>"}}' | .claude/hooks/lint.sh`
  must print the unit's lint output (not "NOT linted");
  `echo '{}' | .claude/hooks/gate.sh; echo $?` must be 0 on a clean tree.
- Run the gate once. Pre-existing failures on the default branch are
  findings, not your bugs; report them.
- Do not create test branches or worktrees in the user's repos to "try"
  `feature-start.sh`; the first real feature does that.

### 7. Hand over

Report, briefly: the layout and units as configured; what was installed and
merged; the open questions still waiting, grouped by who answers; departures
from the opinions; what is left from the one-week plan
(`references/cookbook.md`); and any process or container you started and
stopped.

---

## Feature

For a project with the harness installed. The full loop is the project's
`feature-workflow.md` (template: `templates/workspace/docs/feature-workflow.md`):

1. `scripts/feature-start.sh <name>` and work in that worktree.
2. **Clarify**: query the requirements, read the design source for each
   screen, read the decision log and open questions, run the contradiction
   procedure over what the feature touches, and **ask** the blocking
   questions. Do not build on an open contradiction.
3. Enumerate callers of what you will change.
4. Write or update the **case** first.
5. Decide data access, indexes, caching, job-vs-request, cost at volume.
6. Build every unit the feature touches; contracts generated, not hand-written.
7. Tests: happy path, user-facing error, the isolation boundary.
8. The gate.
9. **Run it yourself** — API by script, screens in a browser, on the server
   you actually changed (`references/cases-and-verification.md` §5).
10. Volume, load and leak checks where they apply.
11. Record lessons (memory) and deferrals (decision log); stop what you started.

## Intake

A new requirements document, change request, or defect batch:

1. Confirm **which product and environment** it is for (forks and sibling
   products make this an easy, expensive mistake).
2. Store the source untouched; for requirements, update the extract.
3. Run the contradiction procedure against the existing requirements, the
   design, the decision log and current behaviour.
4. Log findings; ask the blocking ones; for defects, open one tracker row per
   defect (`templates/workspace/docs/defects.csv`) with the issue verbatim.
5. Each item then goes through the Feature loop.

---

## Ground rules for you, the agent

- **Adapt to the project; never restructure it.** Layout, stack and
  architecture are the project's.
- **Merge, never overwrite.** Existing instructions, settings, lint configs,
  docs and records are kept; templates are merged into them.
- **Never resolve a contradiction silently.** Picking the side that is easier
  to build is a decision nobody made.
- **Ask only what needs a human; recommend an answer every time.**
- **Write every answer down** where the next session finds it.
- **Explain why.** Every rule, hook and script you add carries the failure it
  prevents; the why is what a new team cannot rediscover.
- **Git is the user's.** Commit, push, merge, run migrations or deploy only
  when asked; stage by path.
- **Clean up.** Stop every process and container you started, by listening
  pid after checking it is yours; never an unscoped `pkill -f`. Say what you
  stopped.

## What is in this skill

| Path | What |
|---|---|
| `references/interview.md` | Discovery checklist, question bank with defaults, how to ask, where answers go |
| `references/contradictions.md` | Where contradictions hide, the procedure, classes, register entries, worked examples |
| `references/layouts.md` | Recognising layouts, unit tables, where files go, merging into existing projects, edge cases |
| `references/stacks.md` | Practice → tool per ecosystem, architecture lint, invariants by architecture, "run it" by system kind |
| `references/opinions.md` | The 18 opinions, why, when they may bend, recording a departure |
| `references/enforcement.md` | Instruction loading, hooks and their traps, path-scoped rules, the gate |
| `references/requirements-and-design.md` | Untouched sources, queryable extract, design from markup |
| `references/cases-and-verification.md` | Cases as spec, the check, e2e traps, isolated stacks, running it yourself, load and leaks |
| `references/records-and-parallel-work.md` | Memory, decision log, register, defects, worktrees, parallel sessions, clean-up |
| `references/cookbook.md` | The method for humans, with the one-week adoption plan |
| `templates/` | Everything install.sh places, plus repo-level gate and instructions templates |
| `examples/reference-project/` | The real, sanitised files from the reference project — read for shape, do not copy rules blindly. Index: `examples/README.md` |
| `scripts/install.sh` | Merge-safe installer |
| `scripts/audit.sh` | Read-only report of what a project has and lacks |
| `scripts/selftest.sh` | Self-test of the hooks and scripts on throwaway projects |
| `MANIFEST.md` | Every component of the original harness and where it lives here |
