# Shipwright

*Build the vessel before the voyage: guardrails first, then features.*

Shipwright is a [Claude Code](https://claude.com/claude-code) skill for
taking software from requirements to production with a coding agent, fast and
without the mess. It sets up, adopts or runs an opinionated delivery harness
on **any** project: new or existing, any directory layout, any stack.

Before it installs anything it does three things most setups skip. It
**discovers** what the project already is. It **hunts contradictions**
between the requirements, the design, the code and the config. And it **asks**
the questions only people can answer, each with a recommended answer. Only
then does it install the guardrails, merging into whatever you already have.

It was extracted from a production multi-tenant platform: two products went
from signed BRD to production in three months, about 1,450 commits and 1,024
written test cases. [`references/cookbook.md`](references/cookbook.md)
describes the method for humans.

---

## Contents

- [What you get](#what-you-get)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [What ends up in your project](#what-ends-up-in-your-project)
- [Day-to-day workflow](#day-to-day-workflow)
- [Layouts and stacks](#layouts-and-stacks)
- [Configuration reference](#configuration-reference)
- [Checking and testing](#checking-and-testing)
- [Uninstalling from a project](#uninstalling-from-a-project)
- [FAQ](#faq)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)
- [License](#license)

---

## What you get

| Capability | What it means |
|---|---|
| **Discovery** | Reads layout, stack, CI, existing agent instructions, records and requirements before touching anything, and shows you a summary |
| **Contradiction hunting** | Compares requirement versions, requirements vs prototype, requirements vs invariants, instruction file vs instruction file, docs vs CI, and logs every finding with both sides quoted |
| **Targeted interview** | Asks only what changes what gets built, a few questions at a time, each with a recommended answer, and writes every answer where the next session will find it |
| **Lint on every edit** | A hook lints each file the moment the agent writes it, with the right linter for that part of the project |
| **No red finishes** | A hook stops the agent from ending its turn while typecheck fails |
| **Path-scoped rules** | Rule files that load only when the agent touches matching code |
| **A CI-identical gate** | One command, the same locally and in CI |
| **Feature worktrees** | One command gives every feature its own worktree in every repo it touches, dependencies installed |
| **Cases as the specification** | Plain-English test cases with IDs; a check fails when cases and automated tests drift apart |
| **Records** | An open-questions register, a decision log, a defect tracker, and agent memory |
| **Merge-safe install** | Never overwrites your files; existing settings are merged |
| **Audit** | A read-only report of what a project has and lacks |

## Requirements

- [Claude Code](https://claude.com/claude-code)
- `bash`, `git`, `jq`
- Node.js, only for the cases check
- Your project's own toolchains (whatever its lint and typecheck commands need)

Linux and macOS are supported. On Windows, use WSL.

## Installation

Pick one.

### For yourself, in every project

```bash
git clone https://github.com/msharifafx/shipwright.git ~/.claude/skills/shipwright
```

Update later with `git -C ~/.claude/skills/shipwright pull`.

### For one project, shared with the team through git

```bash
cd your-project
git clone https://github.com/msharifafx/shipwright.git .claude/skills/shipwright
rm -rf .claude/skills/shipwright/.git      # vendor it, or add it as a submodule instead
git add .claude/skills/shipwright
```

### From a release file

Download `shipwright.skill` from the
[latest release](https://github.com/msharifafx/shipwright/releases/latest).
It is a zip archive:

```bash
unzip shipwright.skill -d ~/.claude/skills/
```

On claude.ai, where your organisation allows custom skills, the same file can
be uploaded there.

### Check it is installed

Start Claude Code anywhere and ask *"what skills do you have?"*. Shipwright
should be listed. Claude loads it on its own when a request matches, and you
can always name it: *"use Shipwright to..."*.

## Usage

Start Claude Code at the root of your project (for several repos, at the
directory that holds them), then ask in plain words.

### Set up a new project

> Use Shipwright to set up this project. The BRDs are in docs/brd and the
> prototype is docs/prototype.html.

### Adopt it in an existing codebase

> Use Shipwright on this monorepo. Keep our existing ESLint and ruff setup.

### Run a feature through the loop

> Using Shipwright's workflow, build the merchant bulk-upload feature.

### Check new requirements or a defect list

> Here is change request CR-14 (docs/cr-14.pdf). Check it for contradictions
> with the BRD and the prototype before we build anything.

### Audit a project

> Audit our Claude Code setup against Shipwright.

Or run the audit script yourself:

```bash
~/.claude/skills/shipwright/scripts/audit.sh /path/to/project
```

### What to expect during setup

1. A **discovery summary**: layout, units, what exists, what is missing, what
   it is unsure of. Correct anything wrong.
2. An **open-questions file** written into your docs folder, one entry per
   contradiction or gap, both sides quoted.
3. A few rounds of **questions**, each with a recommended option. Answer, or
   say "go with your recommendation".
4. The **install**, then the files filled in from your answers.
5. A **hand-over**: what was set up, which questions remain open and who should
   answer them, and any place you chose to differ from the defaults.

It does not commit, push, merge or deploy unless you ask.

## How it works

```
                 ┌───────────────┐
  your request ──▶  1. Discover  │  read-only: layout, stack, CI, instructions, requirements
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 2. Contradict │  compare every pair of sources → open-questions register
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 3. Interview  │  ask what needs a human, with recommendations; record answers
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 4. Install    │  hooks, merged settings, templates for what is missing
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 5. Fill       │  instructions, rules, lint, gate, requirements, cases
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 6. Verify     │  audit, hook dry-runs, one gate run
                 └──────┬────────┘
                 ┌──────▼────────┐
                 │ 7. Hand over  │  what was done, what is still open, who answers it
                 └───────────────┘
```

Claude reads the skill in layers, so only what a step needs is in its context:

| Layer | Loaded |
|---|---|
| The name and description in `SKILL.md` | Always, so Claude knows when to use it |
| The body of `SKILL.md`: modes, phases, ground rules | When a request matches |
| `references/*.md`: interview, contradictions, layouts, stacks... | When a phase needs them |
| `scripts/` and `templates/` | Run or copied, never read whole |

## What ends up in your project

All locations are configurable, and in an existing project they point at what
is already there.

```
your-project/
├── CLAUDE.md                    instructions: product, units, invariants, workflow
├── .claude/
│   ├── settings.json            hook wiring (merged into yours)
│   ├── harness.conf             locations, worktree prefix, gate command
│   ├── harness.units            one block per unit: lint, typecheck, install
│   ├── hooks/                   lint.sh · gate.sh · hotfix.sh · _conf.sh
│   ├── hotfix-chain.example     inert until you copy it to hotfix-chain
│   └── rules/                   path-scoped rule files
├── scripts/
│   ├── gate.sh                  the PR gate, identical to CI
│   ├── feature-start.sh         worktree per repo for a feature
│   ├── feature-end.sh           removes them (never forces)
│   └── bootstrap.sh             workspace-of-repos: clone, install, copy hooks
├── docs/
│   ├── feature-workflow.md      the loop and the PR checklist
│   ├── open-questions.md        contradictions and gaps awaiting answers
│   ├── deferred-decisions.md    what was decided not to build, and why
│   ├── defects.csv              one row per defect, with how it was verified
│   └── requirements/            sources untouched, plus a queryable extract
└── e2e/                         optional
    ├── cases/                   plain-English cases: the specification
    └── tools/cases-check.mjs    fails when cases and tests drift apart
```

## Day-to-day workflow

| When | What happens |
|---|---|
| The agent edits a file | `lint.sh` lints it with the owning unit's linter and shows the result immediately |
| The agent tries to finish | `gate.sh` runs typecheck in every unit with changes and blocks while it fails |
| You start a feature | `./scripts/feature-start.sh my-feature` → a worktree per repo on `feat/my-feature`, dependencies installed |
| The feature is built | Clarify → write the case first → build every unit it touches → gate → use it yourself → record what you learned |
| Before a PR | `GATE_CMD` from `harness.conf`, the same command CI runs |
| You finish | `./scripts/feature-end.sh <prefix>my-feature` (refuses a worktree with uncommitted work) |
| A `hotfix:` commit lands on `release` | If you switched it on, `hotfix.sh` merges it down your branch chain locally and never pushes |

## Layouts and stacks

Shipwright describes a project as **units**: directories with their own
toolchain. That covers:

| Layout | Units |
|---|---|
| Single repo | one unit at `.` |
| Monorepo (pnpm, Nx, Turbo, Go work, Cargo, Gradle, Maven, .NET) | one per package or service |
| Workspace of repos | one per repo; `bootstrap.sh` gives each repo its own hooks |
| Sibling repos with no parent | recommends a wrapper directory |
| Submodules, polyglot, app + infra | any mix; each unit has its own commands |

The practices are fixed and the tools are not.
[`references/stacks.md`](references/stacks.md) maps each practice to its
tool for TypeScript, Python, Go, JVM, .NET, Rust and mobile, and lists the
usual invariants for multi-tenant SaaS, payments, event-driven systems, data
pipelines, mobile, serverless, libraries, regulated domains and ML features.

## Configuration reference

### `.claude/harness.units`

```ini
[web]
path = apps/web
exts = ts tsx
lint = npx eslint --fix {file}
typecheck = npx tsc --noEmit -p .
install = pnpm install --frozen-lockfile

[api]
path = services/api
exts = py
lint = ruff check --fix {file} && ruff format {file}
typecheck = mypy .
install = uv sync
```

| Key | Meaning |
|---|---|
| `path` | Unit directory relative to the project root; `.` for the root itself |
| `exts` | File extensions the unit's linter handles |
| `lint` | Lints one file; `{file}` becomes its absolute path. Runs inside the unit |
| `typecheck` | Whole-unit check run when the agent tries to finish |
| `install` | Run in every fresh worktree |

Leave out any key a unit does not have. Commands may contain pipes and quotes.
The longest matching path wins, so a root unit and nested units can coexist.

### `.claude/harness.conf`

| Variable | Example | Meaning |
|---|---|---|
| `PRODUCT` | `Shop` | Product name |
| `DOCS_DIR` | `docs` | Where the workflow and records live |
| `REQUIREMENTS_DIR` | `docs/brd` | Where the requirement sources live (never moved) |
| `CASES_DIR` | `e2e/cases` | Plain-English cases; empty if none yet |
| `DECISIONS_FILE` | `docs/deferred-decisions.md` | Decision log |
| `QUESTIONS_FILE` | `docs/open-questions.md` | Open-questions register |
| `WORKTREE_PREFIX` | `shop-feat-` | Feature worktrees go to `../<prefix><name>` |
| `GATE_CMD` | `./scripts/gate.sh` | The PR gate, same as CI |
| `GIT_BASE` | `git@github.com:your-org` | For `bootstrap.sh` cloning |

### Turning on the hotfix chain

Only if you deploy with one branch per environment, not by promoting one
build through environments:

```bash
cp .claude/hotfix-chain.example .claude/hotfix-chain   # then set the order, most stable first
```

## Checking and testing

```bash
scripts/selftest.sh            # builds throwaway projects in a temp dir; 24 checks
scripts/audit.sh <project>     # read-only report on any project
```

`evals/` holds a behaviour test: a fixture monorepo with planted
contradictions, and the results a good run must produce. Run it with the
skill-creator eval loop or `claude plugin eval`.

## Uninstalling from a project

```bash
rm -rf .claude/hooks .claude/harness.conf .claude/harness.units .claude/hotfix-chain*
# then remove the three hook entries from .claude/settings.json
#   (lint.sh under PostToolUse, gate.sh and hotfix.sh under Stop)
```

The docs, scripts and `CLAUDE.md` it created are ordinary files; keep or
delete them. To remove the skill itself: `rm -rf ~/.claude/skills/shipwright`.

## FAQ

**Will it restructure my repo?** No. It adapts to your layout and never moves
files. For sibling repos with no common parent it suggests adding one.

**Will it overwrite my `CLAUDE.md` or settings?** No. Settings are merged
(and backed up as `.bak`). For any file you already have, the template is
saved beside it as `*.harness-new` for you to merge.

**We use `AGENTS.md`.** It compares the two files for contradictions first.
If your team standardises on `AGENTS.md`, the content stays there and
`CLAUDE.md` imports it, rather than keeping two copies.

**Our codebase has thousands of lint violations.** New rules are strict for
new files and baselined for old ones, and the plan goes in the decision log.
A gate nobody can clear gets switched off.

**Does it work without a BRD?** Yes. Requirements can be tickets, a PRD or
an interview; the contradiction pass covers whatever sources exist,
including code vs docs.

**The lint hook says "NOT linted".** The unit's linter is not installed, which
usually means a fresh worktree with no dependencies. Run the unit's install
command.

**The Stop hook says "typecheck FAILED" but the code is fine.** Hooks run in
a non-interactive shell and may not find your toolchain. Run the typecheck
command yourself; if it passes, put the toolchain on the login `PATH`.

**Does it need the `graphify` skill?** No. A requirements graph helps on large
requirement sets, and a tagged glossary works too.

## Repository layout

```
SKILL.md        the playbook Claude follows
MANIFEST.md     every component of the original harness, and where it went
references/     interview · contradictions · layouts · stacks · opinions ·
                enforcement · requirements-and-design · cases-and-verification ·
                records-and-parallel-work · cookbook (for humans)
templates/      what the installer places in a project
examples/       real files from the reference project, with names removed
scripts/        install.sh · audit.sh · selftest.sh
evals/          behaviour test with a planted-contradiction fixture
```

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. Run `scripts/selftest.sh`; all checks must pass.
2. Keep every hook, script and rule explaining *why* it exists, meaning the
   failure it prevents.
3. Keep `SKILL.md` under 500 lines; detail goes in `references/`.
4. New stack mappings go in `references/stacks.md`, with the tool the
   ecosystem actually uses.

## License

[MIT](LICENSE)
