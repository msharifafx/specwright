# app-workspace

The workspace layer for the reference project. **Three repositories, not two.**

```
app-workspace/              <- THIS repo (the workspace)
├── CLAUDE.md                   workspace rules; cross-repo invariants
├── .claude/
│   ├── settings.json           PostToolUse lint hook for root sessions
│   └── hooks/lint.sh           resolves the owning repo from the file path
├── scripts/
│   ├── bootstrap.sh            clone both repos + install
│   └── feature-start.sh        paired worktrees for a cross-repo feature
├── server-app/   <- independent repo, gitignored here
└── web-app/      <- independent repo, gitignored here
```

## Why this repo exists

The two application repos are cloned independently and cannot import from each other, so anything that spans them has nowhere to live. Before this repo existed, the workspace `CLAUDE.md`, the lint hook, and `feature-start.sh` sat in an untracked directory — meaning a teammate cloning both application repos got **none** of it, and their root sessions ran with **no lint enforcement at all**, silently.

The files must physically sit at the workspace root: Claude Code loads `CLAUDE.md` by walking up the directory tree, and reads `.claude/settings.json` from the session's project root only. So the workspace root *is* the repo, with the two application repos gitignored inside it.

**They are not submodules.** Submodules would pin each application repo to a commit and make ordinary day-to-day work a two-step dance. `.gitignore` keeps `git add -A` from committing them as accidental gitlinks.

## Setup

```bash
git clone <this-repo> app-workspace
cd app-workspace
APP_GIT_BASE=git@github.com:myorg ./scripts/bootstrap.sh
```

Already have both repos cloned here? Skip the script and just install:

```bash
(cd server-app && pnpm install)
(cd web-app    && pnpm install)
```

## Daily use

```bash
cd app-workspace && claude       # start sessions HERE — features span both repos
```

The lint hook resolves the owning repo by walking up from the edited file, so it works from this root, from inside either repo, and from a feature worktree.

Backend services:

```bash
cd server-app && pnpm local:up && pnpm local:verify
```

Cross-repo feature:

```bash
./scripts/feature-start.sh orders-bulk-export
cd ../app-feat-orders-bulk-export && claude
```

## What goes in here

Only things that genuinely span both repos: the workspace `CLAUDE.md`, the lint hook, cross-repo scripts, and shared architecture notes.

Anything belonging to one application belongs in that application's repo. This repo staying small is the point — it is the seam, not a third codebase.
