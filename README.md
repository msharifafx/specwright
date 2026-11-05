# Specwright

*From spec to production, built straight.*

[![selftest](https://github.com/msharifafx/specwright/actions/workflows/selftest.yml/badge.svg)](https://github.com/msharifafx/specwright/actions/workflows/selftest.yml)

Specwright is a [Claude Code](https://claude.com/claude-code) skill for
delivering software with a coding agent, fast and without the mess. It sets
up, adopts or runs an opinionated delivery workflow on **any** project: new or
existing, any directory layout, any stack, on Windows, macOS or Linux.

Before it installs anything, it does three things most setups skip:

1. **Discovers** what the project already is.
2. **Hunts contradictions** between the requirements, the design, the code and
   the config.
3. **Asks** only the questions a person must answer, each with a recommended
   answer.

Then it installs the guardrails, merging into whatever you already have.

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage: `/specwright`](#usage-specwright)
- [How it works](#how-it-works)
- [Tiers](#tiers)
- [What ends up in your project](#what-ends-up-in-your-project)
- [Day-to-day workflow](#day-to-day-workflow)
- [Configuration: `specwright.ini`](#configuration-specwrightini)
- [Layouts and stacks](#layouts-and-stacks)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Checking and testing](#checking-and-testing)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Requirements

| Tool | Why | Install |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | Runs the skill and its hooks | See Anthropic's docs |
| Node.js 18+ | The hooks and scripts are Node, so they run natively everywhere | [nodejs.org](https://nodejs.org) |
| git 2.38+ | Worktrees; hotfix propagation | [git-scm.com](https://git-scm.com) |
| [graphify](https://github.com/Graphify-Labs/graphify) | **Required.** Turns requirement documents into a queryable graph | below |
| Your project's toolchains | Whatever its lint and typecheck commands need | — |

Install graphify (needs Python and [uv](https://docs.astral.sh/uv/) or pipx):

```bash
uv tool install graphifyy        # or: pipx install graphifyy
graphify install                 # Windows: graphify install --platform windows
```

Specwright stops and asks you to install graphify if it is missing.

## Installation

### For yourself, in every project

macOS / Linux:

```bash
git clone https://github.com/msharifafx/specwright.git ~/.claude/skills/specwright
```

Windows (PowerShell):

```powershell
git clone https://github.com/msharifafx/specwright.git "$env:USERPROFILE\.claude\skills\specwright"
```

### For one project, shared with the team through git

```bash
cd your-project
git clone https://github.com/msharifafx/specwright.git .claude/skills/specwright
# then either delete .claude/skills/specwright/.git and commit it,
# or add it as a git submodule instead
```

### From a release file

Download `specwright.skill` from the
[latest release](https://github.com/msharifafx/specwright/releases/latest).
It is a zip archive; extract it into `~/.claude/skills/` (Windows:
`%USERPROFILE%\.claude\skills\`).

### Check it is installed

Restart Claude Code and type `/` — `specwright` appears in the command list.

## Usage: `/specwright`

Start Claude Code at the root of your project (for several repos, at the
directory that holds them) and type `/specwright` followed by what you want,
in plain words:

```text
/specwright <instructions>
```

| You want to | Type |
|---|---|
| Set up a new project | `/specwright set up this project. The BRDs are in docs/brd and the prototype is docs/prototype.html` |
| Adopt it in an existing codebase | `/specwright adopt this monorepo. Keep our existing ESLint and ruff setup` |
| Choose a lighter setup | `/specwright set up this internal tool, lite tier` |
| Build a feature through the loop | `/specwright build the merchant bulk-upload feature` |
| Check new requirements | `/specwright check docs/cr-14.pdf for contradictions with the BRD and the prototype` |
| Triage a defect list | `/specwright triage the defects in uat-defects.xlsx` |
| Audit the setup | `/specwright audit` |
| Not sure | `/specwright` — it looks at the project and offers the options |

You can also just describe the job without the command ("set up this repo
for Claude Code from the BRD"); Claude loads Specwright when the request
matches.

### What to expect during setup

1. A **discovery summary**: layout, units, what exists, what is missing, what
   it is unsure of. Correct anything wrong.
2. An **open-questions file** in your docs folder: one entry per contradiction
   or gap, both sides quoted.
3. A few rounds of **questions**, each with a recommended option, including
   which tier you want. Answer, or say "go with your recommendation".
4. The **install**, then the files filled in from your answers.
5. A **hand-over**: what was set up, which questions remain open and who
   should answer them.

It never commits, pushes, merges or deploys unless you ask.

## How it works

```
/specwright <instructions>
        │
        ▼
 1. Discover      read-only: layout, stack, CI, instructions, requirements
 2. Contradict    build the requirements graph; compare every pair of sources
 3. Interview     ask what needs a human, with recommendations; record answers
 4. Install       hooks, merged settings, templates for what is missing
 5. Fill          instructions, lessons, rules, lint, gate, cases
 6. Verify        audit, hook dry-runs, one gate run
 7. Hand over     what was done, what is still open, who answers it
```

Claude reads the skill in layers, so only what a step needs is in context:
the short description always, `SKILL.md` when invoked, a reference guide when
a phase needs it. Scripts and templates are run or copied, never read whole.

## Tiers

Ceremony scales with the project. The core — guardrails, contradiction
hunting, running what you build — never does.

| | lite | standard | platform |
|---|:-:|:-:|:-:|
| Instructions, lint and typecheck hooks, the gate | ✓ | ✓ | ✓ |
| Feature worktrees | ✓ | ✓ | ✓ |
| Open-questions register, team lessons | ✓ | ✓ | ✓ |
| Decision log, defect tracker, feature workflow doc | | ✓ | ✓ |
| Requirements graph, path-scoped rules, cases as specification | | ✓ | ✓ |
| Hotfix chain, isolated per-session stacks, load test, leak probe | | | ✓ |

Good fits: **lite** for scripts, prototypes and small internal tools;
**standard** for products; **platform** for multi-tenant or high-volume
systems. Move up any time: `/specwright move this project to the standard tier`.

## What ends up in your project

All locations are configurable. In an existing project they point at what is
already there, and nothing is moved.

```
your-project/
├── CLAUDE.md                    product, units, invariants, workflow; imports the lessons
├── .claude/
│   ├── specwright.ini           the one config file: units, gate steps, locations, tier
│   ├── settings.json            hook wiring (merged into yours)
│   ├── hooks/                   lint · gate · turn-start · hotfix  (Node)
│   └── rules/                   path-scoped rule files
├── scripts/
│   ├── gate.mjs                 the PR gate — CI runs the same command
│   ├── feature-start.mjs        a worktree per repo for a feature
│   ├── feature-end.mjs          removes them (never forces)
│   └── bootstrap.mjs            workspace of repos: clone, install, copy hooks
└── docs/
    ├── open-questions.md        contradictions and gaps awaiting answers
    ├── lessons/INDEX.md         team lessons — every session reads them
    ├── deferred-decisions.md    what was decided not to build, and why
    ├── feature-workflow.md      the loop and the PR checklist
    ├── defects.csv              one row per defect, with how it was verified
    └── requirements/            sources untouched, plus the graphify graph
```

## Day-to-day workflow

| When | What happens |
|---|---|
| The agent edits a file | The lint hook lints that file with the right linter for its unit and puts any finding in front of the agent at once |
| The agent tries to finish | The gate hook runs typecheck in every unit touched this turn — uncommitted or committed — and blocks while it fails |
| You start a feature | `node scripts/feature-start.mjs my-feature` creates a worktree per repo on `feat/my-feature`, with dependencies installed |
| The feature is built | Clarify, write the case first, build every unit it touches, run the gate, use it yourself, record lessons |
| Before a PR | `node scripts/gate.mjs`, the same command CI runs |
| You finish | `node scripts/feature-end.mjs <worktree-dir>` (refuses a worktree with uncommitted work) |
| Something cost an hour | Add a lesson in `docs/lessons/`; every teammate's sessions see it |
| A `hotfix:` commit lands (platform tier) | It moves down your branch chain by ref only; no checkout is touched; never pushed |

## Configuration: `specwright.ini`

```ini
[project]
product = Shop
tier = standard
docs_dir = docs
requirements_dir = docs/brd
cases_dir = e2e/cases
lessons_dir = docs/lessons
worktree_prefix = shop-feat-

[unit web]
path = apps/web
exts = ts tsx
lint = npx eslint --fix {file}
typecheck = npx tsc --noEmit -p .
install = pnpm install --frozen-lockfile

[unit api]
path = services/api
exts = py
lint = uv run ruff check --fix {file}
typecheck = uv run mypy .
install = uv sync

[gate]
lint = pnpm -r lint && uv run --directory services/api ruff check .
typecheck = pnpm -r typecheck && uv run --directory services/api mypy .
unit tests = pnpm -r test && uv run --directory services/api pytest
cases = node e2e/tools/cases-check.mjs
```

| Section | Keys |
|---|---|
| `[project]` | `product`, `tier`, `version` (stamped by the installer), `docs_dir`, `requirements_dir`, `cases_dir`, `tests_dir`, `decisions_file`, `questions_file`, `lessons_dir`, `worktree_prefix`, `typecheck_timeout` (seconds, default 150), `git_base` |
| `[unit <name>]` | `path` (`.` = root), `exts`, `lint` (`{file}` = the edited file), `typecheck`, `install`, `typecheck_timeout` |
| `[gate]` | Any step names, run in order by `node scripts/gate.mjs` |

Commands run through the platform shell (cmd.exe on Windows, sh elsewhere),
so prefer package-manager scripts (`npx`, `pnpm`, `uv run`) that behave the
same everywhere. Values may contain pipes, quotes and `=`. The longest
matching unit path owns a file, so a root unit and nested units can coexist.
The audit reports unknown keys, so a typo does not silently switch a check
off.

## Layouts and stacks

| Layout | Units |
|---|---|
| Single repo | one unit at `.` |
| Monorepo (pnpm, Nx, Turbo, Go work, Cargo, Gradle, Maven, .NET) | one per package or service |
| Workspace of repos | one per repo; `bootstrap.mjs` gives each repo its own hooks |
| Sibling repos with no parent | Specwright recommends a wrapper directory |
| Submodules, polyglot, app + infra | any mix; each unit has its own commands |

[`references/stacks.md`](references/stacks.md) maps each practice to its tool
for TypeScript, Python, Go, JVM, .NET, Rust and mobile, and lists the usual
invariants for multi-tenant SaaS, payments, event-driven systems, data
pipelines, mobile, serverless, libraries, regulated domains and ML features.

## Updating and uninstalling

**Update the skill:** `git -C ~/.claude/skills/specwright pull`.

**Update a project's hooks** after updating the skill: `/specwright audit`
reports when the hooks are older than the skill; then
`/specwright update the hooks in this project`. Hooks are replaced, and your
config and docs are kept.

**Remove from a project:** delete `.claude/hooks/` and `.claude/specwright.ini`,
then remove the four `node .claude/hooks/...` entries from
`.claude/settings.json`. The docs and scripts it created are ordinary files;
keep or delete them.

**Remove the skill:** delete `~/.claude/skills/specwright`.

## Checking and testing

```bash
node scripts/selftest.mjs               # 35 checks on throwaway projects
node scripts/audit.mjs <project-root>   # read-only report on any project
```

CI runs the self-test on Ubuntu, macOS and Windows with Node 18 and 22.
`evals/` holds a behaviour test: a fixture project with planted
contradictions, and what a good run must find.

## FAQ

**Will it restructure my repo?** No. It adapts to your layout and never moves
files.

**Will it overwrite my `CLAUDE.md` or settings?** No. Settings are merged and
backed up as `settings.json.bak`. For any other file you already have, the
template is saved beside it as `*.specwright-new` and merged by hand or by the
agent, keeping your rules.

**We use `AGENTS.md`.** It compares the two files for contradictions first.
If your team standardises on `AGENTS.md`, the content stays there and
`CLAUDE.md` imports it.

**Our codebase has thousands of lint violations.** New rules are strict for new
files and baselined for old ones, and the plan goes in the decision log. A
gate nobody can clear gets switched off.

**Does it work without a BRD?** Yes. Requirements can be tickets, a PRD or the
interview; the contradiction pass covers whatever sources exist, including
code vs docs.

**The lint hook says "NOT linted".** The unit's linter is not installed —
usually a fresh worktree. Run the unit's install command.

**The gate hook says "typecheck FAILED" but the code is fine.** The hook's
shell may not find your toolchain. Run the typecheck yourself; if it passes,
put the toolchain on the PATH Claude Code starts with.

**Typecheck is slow.** Use an incremental mode (`tsc -b`, `mypy --incremental`,
`cargo check`) in the unit's `typecheck`, or raise `typecheck_timeout`. A check
that runs past its budget blocks with a message rather than passing silently.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `node scripts/selftest.mjs` passes. CI runs it on all three operating
   systems.
2. Every hook, script and rule says *why* it exists: the failure it prevents.
3. `SKILL.md` stays under 500 lines; detail goes in `references/`.
4. New stack mappings go in `references/stacks.md`.

## License

[MIT](LICENSE)
