# Layouts: fitting the harness to any directory structure

The harness never asks a project to restructure. It describes the project as
**units** — directories with their own toolchain — and finds the git layout
itself. This file says how to recognise each layout, how to write its unit
table, and where the harness files go, for new and existing projects alike.

## Contents

1. Vocabulary
2. Recognising the layout
3. Unit tables per layout
4. Where harness files go
5. Existing projects: merge, never overwrite
6. Edge cases

---

## 1. Vocabulary

- **Harness root**: the directory holding `.claude/` with `harness.conf` and
  `harness.units`. Sessions start here.
- **Unit**: a directory with its own manifest and toolchain (lint, typecheck,
  install). A unit may be a whole repo, a package in a monorepo, or the root.
- **Git root**: a directory that is the top of a git working tree. One for a
  single repo or monorepo; several for a workspace of repos.

## 2. Recognising the layout

| Layout | Signs | Harness root |
|---|---|---|
| **Single repo** | One git root, one manifest at the top | The repo root |
| **Monorepo** | One git root; a workspace file (`pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `go.work`, Cargo `[workspace]`, Gradle `settings.gradle`, Maven `<modules>`, `.sln`) or several manifests under `apps/`, `packages/`, `services/` | The repo root |
| **Workspace of repos** | A parent directory (maybe its own small git repo) with several cloned repos inside it, gitignored there | The parent directory |
| **Sibling repos, no wrapper** | Several repos side by side with nothing above them | Ask to create a wrapper directory above them (recommended), or pick one repo as host and treat the others as separate harnesses |
| **Submodules** | `.gitmodules` at the root | The super-repo root; each submodule is its own git root |
| **Polyglot** | Any of the above with different languages per unit | Unchanged — each unit declares its own commands |
| **Mixed app + infra** | Terraform/Pulumi/CDK alongside apps | Infra is a unit too (fmt + validate) |

Detect with:

```bash
for d in . */ */*/; do
  [ -d "$d" ] || continue
  top=$(git -C "$d" rev-parse --show-toplevel 2>/dev/null) && echo "$d -> $top"
done | sort -u -k3
ls -a | grep -E 'pnpm-workspace|nx.json|turbo.json|go.work|lerna.json|settings.gradle|\.sln$|\.gitmodules'
```

Then show the user the layout you inferred and the unit list before writing
anything. A wrong unit list is cheap to fix now and confusing later.

## 3. Unit tables per layout

`harness.units` is INI-style: one `[name]` block per unit with `path`, `exts`,
`lint`, `typecheck`, `install`. Commands run inside the unit directory and may
contain pipes and quotes. Stack-specific commands are in `stacks.md`.

**Single repo (TypeScript):**

```ini
[app]
path = .
exts = ts tsx
lint = npx eslint --fix {file}
typecheck = npx tsc --noEmit
install = pnpm install --frozen-lockfile
```

**Monorepo (web + Python API + Terraform):**

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

[infra]
path = infra
exts = tf
lint = terraform fmt {file}
typecheck = terraform validate
install = terraform init -backend=false
```

In a JS monorepo the install usually belongs to the root: give the root its
own unit with only `install`, and leave `install` out of the packages.

**Workspace of repos:** one block per repo, `path` = the repo directory. Run
`scripts/bootstrap.sh` once: it clones missing repos and gives each its own
hook copy and a unit table naming only itself, because a session started
inside a repo reads only that repo's `.claude/`.

The **longest matching path wins**, so a root unit and nested units can
coexist: `services/api/x.py` goes to `[api]`, `scripts/tool.ts` to the root.

## 4. Where harness files go

| File | Single repo / monorepo | Workspace of repos |
|---|---|---|
| `.claude/hooks/*.sh`, `settings.json`, `harness.conf`, `harness.units` | Repo root, **committed** | Workspace root, and a copy in each repo (bootstrap.sh) |
| Workspace `CLAUDE.md` | Repo root `CLAUDE.md` | Workspace root |
| Unit `CLAUDE.md` | Optional, in each unit directory; loads when files there are read | Each repo root |
| `.claude/rules/*.md` (path-scoped) | Repo root `.claude/rules/`, `paths:` relative to the repo root | Each repo's `.claude/rules/` |
| `scripts/feature-start.sh`, `feature-end.sh` | `scripts/` at the root (or wherever scripts already live) | Workspace `scripts/` |
| Decision log, open questions, defects, requirements | `DOCS_DIR` (an existing `docs/`, `doc/`, ADR folder...) | The workspace's docs |
| Cases | `CASES_DIR`: beside the existing e2e/UI tests if any; else a new `e2e/` unit or repo | Usually a separate e2e repo |
| Memory | The agent's memory directory (outside the repo) | Same |

Every location is a variable in `harness.conf`. Templates and docs refer to
the variables, never to a fixed path.

## 5. Existing projects: merge, never overwrite

- **Agent instructions.** If `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or
  `copilot-instructions.md` exist, read them first. Merge the template's
  sections into the existing file, keep every existing rule, and list any
  rule that contradicts the harness as a question (it is a config-vs-practice
  contradiction). If the project uses `AGENTS.md` as the shared file, make
  `CLAUDE.md` a one-line `@AGENTS.md` import rather than a second copy.
- **`.claude/settings.json`.** Merge hook arrays with `jq`; never replace the
  file. `scripts/install.sh` does this.
- **Lint config.** Add the architecture and size rules to the existing
  config. If the codebase has thousands of violations, add them as
  **warnings on existing files and errors on new ones** (lint overrides by
  path, or a baseline file) and record the plan in the decision log. Do not
  switch on 3,000 errors on day one; nobody can clear that gate, so somebody
  will switch it off.
- **Gate.** If a `make check`/`npm run ci`/`tox` already exists, the gate
  wraps it and adds what is missing. One command, identical to CI.
- **Docs.** Use the existing docs folder and ADR format. If ADRs exist, the
  decision log is a new ADR type or an index into them, not a parallel file.
- **Tests.** Cases go beside the existing end-to-end tests, and the cases
  check scans that directory.

## 6. Edge cases

- **The harness root is not a git repo** (a plain workspace folder): fine.
  Feature worktrees create a plain directory and put a worktree per repo
  inside it.
- **A unit outside the harness root:** not supported by the feature scripts.
  Recommend a wrapper directory, or a separate harness for that repo.
- **Generated code in a unit:** add the generated directory to the linter's
  ignore list, not to the unit's `exts`.
- **Very slow typecheck** (> 60 s): use an incremental mode (`tsc -b`,
  `mypy --incremental`, `cargo check`), or narrow the Stop hook's
  `typecheck` to the changed project; the full check stays in the gate.
- **No typecheck exists** (plain JS, Ruby, PHP without a checker): use the
  fastest whole-unit correctness check available (a compile, `php -l` over
  changed files, `ruby -wc`, the unit tests of the changed module), or leave
  it out and say so in the decision log.
