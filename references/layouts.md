# Layouts: fitting Specwright to any directory structure

Specwright never asks a project to restructure. It describes the project as
**units** — directories with their own toolchain — and finds the git layout
itself. This file says how to recognise each layout, how to write its unit
table, and where Specwright's files go, for new and existing projects alike.

## Contents

1. Vocabulary
2. Recognising the layout
3. Unit tables per layout
4. Where the files go
5. Existing projects: merge, never overwrite
6. Edge cases

---

## 1. Vocabulary

- **Project root**: the directory holding `.claude/specwright.ini`. Sessions
  start here.
- **Unit**: a directory with its own manifest and toolchain (lint, typecheck,
  install). A unit may be a whole repo, a package in a monorepo, or the root.
- **Git root**: a directory that is the top of a git working tree. One for a
  single repo or monorepo; several for a workspace of repos.

## 2. Recognising the layout

| Layout | Signs | Project root |
|---|---|---|
| **Single repo** | One git root, one manifest at the top | The repo root |
| **Monorepo** | One git root; a workspace file (`pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `go.work`, Cargo `[workspace]`, Gradle `settings.gradle`, Maven `<modules>`, `.sln`) or several manifests under `apps/`, `packages/`, `services/` | The repo root |
| **Workspace of repos** | A parent directory (maybe its own small git repo) with several cloned repos inside it, gitignored there | The parent directory |
| **Sibling repos, no wrapper** | Several repos side by side with nothing above them | Ask to create a wrapper directory above them (recommended), or pick one repo as host and treat the others as separate harnesses |
| **Submodules** | `.gitmodules` at the root | The super-repo root; each submodule is its own git root |
| **Polyglot** | Any of the above with different languages per unit | Unchanged — each unit declares its own commands |
| **Mixed app + infra** | Terraform/Pulumi/CDK alongside apps | Infra is a unit too (fmt + validate) |

Detect with the audit, on any OS:

```
node <skill>/scripts/audit.mjs <candidate-root>
```

Its Layout section lists whether the root is a git repo, the nested git
repos, the monorepo files, and every manifest three levels down.

Then show the user the layout you inferred and the unit list before writing
anything. A wrong unit list is cheap to fix now and confusing later.

## 3. Unit tables per layout

Units are `[unit <name>]` blocks in `.claude/specwright.ini`, with `path`,
`exts`, `lint`, `typecheck`, `install` and optionally `typecheck_timeout`.
Commands run inside the unit directory, through the platform shell (`cmd.exe`
on Windows, `/bin/sh` elsewhere), and may contain pipes, quotes and `=`.
Unknown keys are reported by the audit, so a typo cannot silently switch a
check off. Stack-specific commands are in `stacks.md`.

**Single repo (TypeScript):**

```ini
[unit app]
path = .
exts = ts tsx
lint = npx eslint --fix {file}
typecheck = npx tsc --noEmit
install = pnpm install --frozen-lockfile
```

**Monorepo (web + Python API + Terraform):**

```ini
[unit web]
path = apps/web
exts = ts tsx
lint = npx eslint --fix {file}
typecheck = npx tsc --noEmit -p .
install = pnpm install --frozen-lockfile

[unit api]
path = services/api
exts = py
lint = ruff check --fix {file} && ruff format {file}
typecheck = mypy .
install = uv sync

[unit infra]
path = infra
exts = tf
lint = terraform fmt {file}
typecheck = terraform validate
install = terraform init -backend=false
```

In a JS monorepo the install usually belongs to the root: give the root its
own unit with only `install`, and leave `install` out of the packages.

**Workspace of repos:** one block per repo, `path` = the repo directory. Run
`node scripts/bootstrap.mjs` once: it clones missing repos and gives each its
own hook copy and a `specwright.ini` naming only itself, because a session
started inside a repo reads only that repo's `.claude/`.

The **longest matching path wins**, so a root unit and nested units can
coexist: `services/api/x.py` goes to `[unit api]`, `scripts/tool.ts` to the root.

## 4. Where the files go

| File | Single repo / monorepo | Workspace of repos |
|---|---|---|
| `.claude/hooks/*.mjs`, `settings.json`, `specwright.ini` | Repo root, **committed** | Workspace root, and a copy in each repo (`bootstrap.mjs`) |
| `.claude/.specwright/` (turn state) | Created by the hooks; ignores itself | Same |
| Workspace `CLAUDE.md` | Repo root `CLAUDE.md` | Workspace root |
| Unit `CLAUDE.md` | Optional, in each unit directory; loads when files there are read | Each repo root |
| `.claude/rules/*.md` (path-scoped) | Repo root `.claude/rules/`, `paths:` relative to the repo root | Each repo's `.claude/rules/` |
| `scripts/gate.mjs`, `feature-start.mjs`, `feature-end.mjs`, `bootstrap.mjs` | `scripts/` at the root | Workspace `scripts/` |
| Open questions, decision log, defects, requirements | `docs_dir` and friends (an existing `docs/`, `doc/`, ADR folder...) | The workspace's docs |
| Team lessons | `lessons_dir` (default `docs/lessons/`), imported by `CLAUDE.md` | Same, at the workspace |
| Cases | `cases_dir`: beside the existing e2e/UI tests if any; else a new `e2e/` unit or repo | Usually a separate e2e repo |

Every location is a key in `[project]` of `specwright.ini`. Templates and docs
refer to the keys, never to a fixed path.

## 5. Existing projects: merge, never overwrite

- **Agent instructions.** If `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or
  `copilot-instructions.md` exist, read them first. Merge the template's
  sections into the existing file, keep every existing rule, and list any
  rule that contradicts Specwright as a question (it is a config-vs-practice
  contradiction). Compare `AGENTS.md` and friends with `CLAUDE.md` for
  contradictions **before** merging or importing; if the project then uses
  `AGENTS.md` as the shared file, make `CLAUDE.md` import it (`@AGENTS.md`)
  rather than keep a second copy.
- **Templates for files you already have** land beside them as
  `<name>.specwright-new`. Merge by hand (or have the agent merge), then
  delete the `.specwright-new` file; the audit lists any left over.
- **`.claude/settings.json`.** Hook entries are merged in — only commands not
  already wired are added — and the previous file is kept as
  `settings.json.bak`. `install.mjs` does this; never replace the file.
- **Lint config.** Add the architecture and size rules to the existing
  config. If the codebase has thousands of violations, add them as
  **warnings on existing files and errors on new ones** (lint overrides by
  path, or a baseline file) and record the plan in the decision log. Do not
  switch on 3,000 errors on day one; nobody can clear that gate, so somebody
  will switch it off.
- **Gate.** If a `make check`/`npm run ci`/`tox` already exists, make it a
  step in `[gate]` and add what is missing. One command —
  `node scripts/gate.mjs` — identical to CI.
- **Docs.** Use the existing docs folder and ADR format. If ADRs exist, the
  decision log is a new ADR type or an index into them, not a parallel file.
- **Tests.** Cases go beside the existing end-to-end tests, and the cases
  check scans that directory.

## 6. Edge cases

- **The project root is not a git repo** (a plain workspace folder): fine.
  Feature worktrees create a plain directory and put a worktree per repo
  inside it.
- **A unit outside the project root:** not supported by the feature scripts.
  Recommend a wrapper directory, or a separate Specwright install in that repo.
- **Windows teams:** unit commands run in `cmd.exe`. Prefer package-manager
  scripts and `npx`; avoid `;`, single quotes and POSIX-only tools in
  commands, or a Windows developer sees "NOT linted" while macOS is green.
- **Generated code in a unit:** add the generated directory to the linter's
  ignore list, not to the unit's `exts`.
- **Very slow typecheck**: past `typecheck_timeout` (default 150 s) the Stop
  hook blocks with a message rather than passing. Use an incremental mode
  (`tsc -b`, `mypy --incremental`, `cargo check`), or narrow the unit's
  `typecheck` to the changed project; the full check stays in the gate.
- **No typecheck exists** (plain JS, Ruby, PHP without a checker): use the
  fastest whole-unit correctness check available (a compile, `php -l` over
  changed files, `ruby -wc`, the unit tests of the changed module), or leave
  it out and say so in the decision log.
