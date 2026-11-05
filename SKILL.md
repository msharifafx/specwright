---
name: specwright
description: Specwright takes a software project from spec to production with guardrails. It discovers the project, hunts contradictions between requirements, design, code and config, asks only what needs a human, then installs hooks, rules, a CI-identical gate, feature worktrees and cases-as-spec. Use it for /specwright, starting a project from a BRD or PRD, onboarding a codebase for Claude Code, a contradiction check on new requirements or a defect batch, running a feature through the loop, or auditing a project's AI-delivery setup.
---

# Specwright

*From spec to production, built straight.*

A method and a kit for delivering software with a coding agent, fast and
without the mess. **Opinionated about practice, neutral about layout and
stack**: the practices are fixed defaults (`references/opinions.md`); the
directory structure, languages, architecture and tools stay the project's.

Your most important job is not installing files. It is **finding what the
project's people know that the files do not**: which source is current, what
may never break, where two documents disagree. Ask those questions, only
those, and write every answer where the next session will find it.

## How you are invoked

Usually as `/specwright <instructions>`. **Treat everything after the command
as the user's request** and pick the mode from it. `/specwright` alone: run
discovery on the current directory and ask what they want, offering the modes
below. Specwright also loads on its own when a request matches the
description.

Examples: `/specwright set up this project, BRDs in docs/brd` ·
`/specwright adopt this monorepo, keep our ESLint` ·
`/specwright check CR-14.pdf for contradictions` ·
`/specwright build the bulk-upload feature` · `/specwright audit`.

## Pick the mode

| The user wants to... | Mode |
|---|---|
| Start a new project (from a BRD/PRD, or from nothing) | **Setup** — new |
| Bring an existing codebase under Specwright | **Setup** — existing |
| Build a feature or fix a defect where Specwright is installed | **Feature** |
| Process a new requirements document, change request or defect batch | **Intake** |
| Know what a project's setup is missing or outdated | **Audit**: `node <skill>/scripts/audit.mjs <root>`, then report |
| Update the project's hooks to this version, or change tier | **Update**: `node <skill>/scripts/install.mjs <root> [--tier <tier>]` — it reuses the existing `specwright.ini`, replaces only the hooks, places what the new tier adds; then fill those parts (Setup phase 5) and verify (phase 6) |

`<skill>` is this skill's directory. If the mode is unclear, run discovery
(Setup step 1) first; what you find usually decides it.

## Prerequisites — check first, every mode

- **Node.js 18+ and git** on PATH. The hooks and scripts are Node, so they run
  natively on Windows, macOS and Linux.
- **graphify is required.** Check `graphify --help` runs and the `graphify`
  skill is available. If not, **stop** and give the user the commands:
  `uv tool install graphifyy` (or `pipx install graphifyy`), then
  `graphify install` (Windows: `graphify install --platform windows`), then
  restart Claude Code. Do not continue setup without it: the requirements
  graph is how every later feature asks "what does the spec say".

---

## Setup (new or existing)

Work through the phases in order. Install nothing before phase 4: the
interview changes what gets installed.

### 1. Discover — read-only, before asking anything

Answer everything the project can answer itself (`references/interview.md`
§2 has the full checklist):

- **Layout and units.** Run `node <skill>/scripts/audit.mjs <candidate-root>`.
  Identify the layout (single repo, monorepo, workspace of repos, sibling
  repos, submodules) and the units — directories with their own toolchain.
  `references/layouts.md`.
- **Stack per unit**: manifests, lint/format/typecheck/test commands, the
  commands CI actually runs. `references/stacks.md`.
- **What exists**: agent instruction files (`CLAUDE.md`, `AGENTS.md`,
  `.cursorrules`, copilot instructions), `.claude/settings.json`, lint
  configs, ADRs/decision records, tests, CI/CD and the deployment model, the
  local environment.
- **Requirements and design**: BRDs, PRDs, prototypes, design links, scope
  emails; versions and dates.
- **History of pain** (existing projects): reverts, hotfixes, reopened
  issues, lint-disable counts.

**Do not trust a command because CI runs it.** Check the configuration it
needs exists (a `tsc` with no tsconfig, a linter with no config, tests with no
test files). A broken CI is a finding, not a source of truth.

Show the user a **discovery summary** in this shape:

```
Layout:        <single repo | monorepo | workspace | ...>, project root = <path>
Units:         <path> — <stack>; lint/typecheck/test as CI runs them
Exists:        <instruction files, settings, CI + deploy model, records, tests, local env>
Requirements:  <sources with versions and dates>
Missing:       <what Specwright would add>
Unsure of:     <what you could not settle — these feed the interview>
```

Fill every line; write "none" rather than leaving one out.

### 2. Hunt contradictions

Follow `references/contradictions.md`: collect sources, extract claims with
their references, group by subject, compare, check each against the likely
invariants, check the silences (failure, retry, duplicates, permissions,
volume, deletion). Classify each finding: conflict, supersession, gap,
invariant breach, drift, naming, false alarm.

Build the requirements graph first when there are requirement documents:
`/graphify <requirements dir>`, then query it per subject
(`references/requirements-and-design.md`).

Write every real finding into the open-questions register (template
`templates/workspace/docs/open-questions.md`) at
`<existing docs folder>/open-questions.md` (`docs/open-questions.md` if there
is none), both sides quoted exactly, with class, options and a
recommendation. Drift needing no stakeholder is logged as an FYI entry, not
asked.

**Instruction files are sources too.** Compare `CLAUDE.md`, `AGENTS.md`,
`.cursorrules` and the like against each other, the code and CI **before**
anything merges or imports them.

### 3. Interview — ask what needs a human

`references/interview.md` §3 is the question bank (each with a default); §4
says how to ask.

- Ask only what changes what gets built; otherwise take the default and say
  so in one line.
- Always confirm the starred items: what the product is and who uses it,
  current requirement sources, who decides conflicts, the **invariants**, the
  deployment model, and the **tier** (`references/tiers.md`: lite, standard,
  platform — default standard).
- Ask the blocking contradictions from phase 2.
- Use `AskUserQuestion` when available: at most four questions per call, each
  self-contained, recommended option first, plain language, both sides of a
  contradiction quoted.

Record each answer where it belongs (`references/interview.md` §5). If no one
can answer now: keep it open, take the default for what it does not block,
and say so.

### 4. Install

0. **New project:** scaffold each unit first (manifest, lint config,
   typecheck config, one source file) so the hooks have something to run.
1. Write the project's `specwright.ini` from what you found and were told
   (template: `templates/workspace/.claude/specwright.ini`): `[project]`
   locations and tier, one `[unit <name>]` per unit (path, exts, lint with
   `{file}`, typecheck, install), and `[gate]` steps in order — the same
   commands CI runs. In an existing project every location points at **what
   already exists**.
2. Run `node <skill>/scripts/install.mjs <root> --config <file>`. It writes
   the hooks, **merges** hook wiring into an existing `settings.json` (backup
   `.bak`), stamps the version, and never overwrites a project file: a
   template for an existing file lands beside it as `*.specwright-new` for you
   to merge.
3. Workspace of repos: run `node scripts/bootstrap.mjs` so every repo gets its
   own hooks (a session may start inside a repo).
4. Point CI at `node scripts/gate.mjs`, or keep CI's command and mirror it in
   `[gate]`. One command, identical to CI.

Never restructure the project. Never commit, push, merge, migrate or deploy
unless asked; stage by path when you do commit.

### 5. Fill — make it the project's own

What to fill depends on the tier (`references/tiers.md`).

- **Instruction files.** Fill `CLAUDE.md` (product, units, invariants, where
  requirements and open questions live, the feature loop, local environment,
  working beside other sessions, and the import `@<lessons_dir>/INDEX.md`).
  Existing project: merge `CLAUDE.md.specwright-new` into the existing file,
  keep every existing rule, and send conflicting ones to the register. A
  team on `AGENTS.md` keeps content there and imports it. Per-unit
  instruction files where units differ. `references/enforcement.md` §1.
- **Team lessons** (all tiers). `<lessons_dir>/INDEX.md` in the repo, one line
  per lesson, imported by `CLAUDE.md`, so every developer's sessions learn
  from every trap. Seed it with traps already known from the history.
- **Path-scoped rules** (standard+). One `.claude/rules/<topic>.md` per topic
  where a mistake is silent until production. `references/enforcement.md` §3.
- **Architecture lint**. Boundaries, one door for dangerous handles, no
  cycles, size limits, narrow DRY, type safety, in the unit's own linter
  (`references/stacks.md` §2). Existing code with many violations: strict for
  new files, baselined for old, plan in the decision log.
- **Topic docs** (standard+). Short build docs, one topic each, that rules
  link to. Existing projects: link what exists; write only what is missing.
- **Invariants into enforcement.** Each confirmed invariant gets a lint rule,
  a test, or at least a line in the instructions file with its reason.
- **Requirements** (standard+). Sources stay where they are; the graph from
  `/graphify` sits beside them.
- **Cases** (standard+, when there is UI or an end-to-end flow). Cases
  directory beside existing e2e tests, the check as a `[gate]` step, a first
  case file for one screen. `references/cases-and-verification.md`.
- **Verification** (platform). Per-session isolated stacks, multi-tenant load
  test, leak probe.
- **Departures** from an opinion go into the decision log with the reason.

### 6. Verify

- `node <skill>/scripts/audit.mjs <root>`: nothing missing for the tier, no
  unfilled `__PLACEHOLDERS__`, no unmerged `*.specwright-new`, no unknown
  config keys, version current.
- Feed the hooks real input from the project root:
  `node .claude/hooks/lint.mjs` with stdin
  `{"tool_input":{"file_path":"<absolute path of a real source file>"}}` must
  exit 0 on a clean file and exit 2 with findings on a broken one;
  `node .claude/hooks/gate.mjs` with stdin `{}` must exit 0 on a clean tree.
- Run `node scripts/gate.mjs` once. Failures that already exist on the
  default branch are findings to report, not your bugs.
- Do not create test branches or worktrees in the user's repos to try
  `feature-start.mjs`; the first real feature does that.

### 7. Hand over

Report briefly: layout and units as configured, tier, what was installed and
merged, open questions grouped by who answers, departures from the opinions,
what remains of the adoption plan (`references/cookbook.md`), and every
process or container you started and stopped.

---

## Feature

For a project with Specwright installed. The full loop is the project's
`feature-workflow.md` (template `templates/workspace/docs/feature-workflow.md`):

1. `node scripts/feature-start.mjs <name>` and work in that worktree.
2. **Clarify**: query the requirements graph, read the design source for each
   screen, read the decision log, open questions and lessons, run the
   contradiction procedure over what the feature touches, and **ask** the
   blocking questions. Do not build on an open contradiction.
3. Enumerate callers of what you will change.
4. Write or update the **case** first.
5. Decide data access, indexes, caching, job-vs-request, cost at volume.
6. Build every unit the feature touches; contracts generated, not hand-written.
7. Tests: happy path, user-facing error, the isolation boundary.
8. `node scripts/gate.mjs`.
9. **Run it yourself**: API by script, screens in a browser, on the server you
   actually changed (`references/cases-and-verification.md` §5).
10. Volume, load and leak checks where the tier and feature call for them.
11. Add a lesson for anything that cost time; log deferrals; stop what you
    started; `node scripts/feature-end.mjs <dir>` once merged.

## Intake

A new requirements document, change request or defect batch:

1. Confirm **which product and environment** it is for.
2. Store the source untouched; update the graph (`/graphify <requirements dir> --update`).
3. Run the contradiction procedure against existing requirements, the design,
   the decision log and current behaviour.
4. Log findings, ask the blocking ones; for defects, one tracker row each
   (`templates/workspace/docs/defects.csv`), issue verbatim.
5. Each item then goes through the Feature loop.

---

## Ground rules for you, the agent

- **Adapt to the project; never restructure it.**
- **Merge, never overwrite.** Existing instructions, settings, lint configs,
  docs and records are kept; templates are merged into them.
- **Never resolve a contradiction silently.** Picking the side that is easier
  to build is a decision nobody made.
- **Ask only what needs a human; recommend an answer every time.**
- **Write every answer down** where the next session finds it.
- **Explain why.** Every rule, hook and script you add carries the failure it
  prevents.
- **Git is the user's.** Commit, push, merge, migrate or deploy only when
  asked; stage by path.
- **Clean up.** Stop every process and container you started, by the pid
  listening on its port after checking it is yours; never an unscoped kill.
  Say what you stopped.

## What is in this skill

| Path | What |
|---|---|
| `references/interview.md` | Discovery checklist, question bank with defaults, how to ask, where answers go |
| `references/contradictions.md` | Where contradictions hide, the procedure, classes, register entries, examples |
| `references/tiers.md` | Lite, standard, platform: what each includes and how to choose |
| `references/layouts.md` | Recognising layouts, unit blocks, where files go, merging into existing projects |
| `references/stacks.md` | Practice → tool per ecosystem, architecture lint, invariants by architecture |
| `references/opinions.md` | The opinions, why, when they may bend, recording a departure |
| `references/enforcement.md` | Instruction loading, hooks and their traps, path-scoped rules, the gate |
| `references/requirements-and-design.md` | Untouched sources, the graphify graph, design from markup |
| `references/cases-and-verification.md` | Cases as spec, the check, e2e traps, isolated stacks, running it yourself |
| `references/records-and-parallel-work.md` | Team lessons, decision log, register, defects, worktrees, clean-up |
| `references/cookbook.md` | The method for humans, with the adoption plan |
| `templates/` | What install.mjs places |
| `examples/` | Fourteen real files from the reference project, for shape — index in `examples/README.md` |
| `scripts/install.mjs` · `audit.mjs` · `selftest.mjs` | Merge-safe installer · read-only audit · cross-platform self-test |
