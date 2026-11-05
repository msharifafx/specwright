# Records and parallel work

## Contents

1. Memory: every mistake paid for once
2. The decision log
3. The open-questions register
4. The defect tracker
5. Worktrees and parallel sessions
6. Cleaning up

---

## 1. Memory: every mistake paid for once

When something costs an hour, write a note the agent reads in every later
session. After three months the reference project had 90+ notes; each is a
day nobody loses twice. This is where the speed compounds.

Claude Code's file memory: one file per fact in the project memory directory,
plus `MEMORY.md`, an index with one line per note that is loaded every
session. Templates: `templates/memory/`.

- **Name the trap, not the topic**: "Kill the API by its listening pid", not
  "Process management".
- **Symptom, cause, what to do instead.** The symptom matters most; it is
  what you will see next time.
- **Say why**, so a later reader can tell when it no longer applies.
- **Do not save what the repo already records** (code structure, git history,
  the instructions file).
- **Update, do not duplicate; delete notes that turn out wrong.**
- **Promote**: a note that fires every week becomes a script, a lint rule or a
  line in the instructions file.

Sample traps from the reference project (each was a note):

| Trap | Symptom | Note says |
|---|---|---|
| Shared local queue | A job never runs | Another worktree's worker took it; own queues per stack |
| ORM template drops the table qualifier | A correlated count is silently zero | Qualify the column by hand in raw SQL |
| Chunked job closes its run early | "Succeeded" after chunk one | Carry the run id in the payload |
| Migration masked by a newer branch | Fan-out says migrated; column missing | Wait until the other migration is in the default branch |
| Concurrent session commits your work | Your files under someone else's commit | Stage by path |
| Worktree from a stale default branch | Gate fails in a file you never touched | Fast-forward the base first |
| Hook shell lost the toolchain | "typecheck FAILED" with no type error | Run it yourself before chasing it |
| Uncommitted contract | Gate fails after regenerating | The freshness check is a `git diff`; commit |
| A red scan on the default branch too | Gate fails on CVEs you did not add | Check the default branch before blaming yours |

## 2. The decision log

`DECISIONS_FILE` (template `templates/workspace/docs/deferred-decisions.md`).
Every deliberate "not now", every choice between two readings, every harness
departure. Each entry: status, current behaviour, the reasoning with sources,
and what must be true before it is picked up. The reference log is 2,700
lines; a settled question is looked up, not argued again. Check it before
designing anything touching roles, approvals, money or reports.

A decision living only in a commit message is a decision nobody finds.

## 3. The open-questions register

`QUESTIONS_FILE` (template `templates/workspace/docs/open-questions.md`). The
output of the contradiction procedure: both sides quoted, why it matters,
options, recommendation, who answers. Answered entries stay, marked ANSWERED,
as the evidence for why the product behaves as it does.

## 4. The defect tracker

A CSV (template `templates/workspace/docs/defects.csv`), one row per defect:
ID, module, reporter, screen, the issue verbatim, layer, owner, priority,
reported status, work status, branch, commits, **how it was verified**, notes.
"Fixed" with an empty *Verified How* is not done.

When a defect list arrives, first confirm **which product and environment it
is for** — with forks or several products, a list for the other one is an
easy and expensive mistake.

## 5. Worktrees and parallel sessions

- **A worktree per feature**, in every repo the feature touches, same branch
  name everywhere (including the cases repo): `scripts/feature-start.sh`.
  Dependencies installed first; `.env` copied; untracked instructions and
  hooks copied.
- **Fan out independent work** to several agent sessions, each in its own
  worktree.
- **The supervisor (a person) owns the shared things**: commits, merges,
  pushes, migrations, deploys. Agents edit files. Migrations from two branches
  on one shared database collide; a migration "lane" is an ordering, not a
  schedule: wait until the other migration is in the default branch.
- **Stage by path, never `git add -A`**, wherever a checkout is shared.
- **Never `git checkout -- <file>` a file an agent may have edited** without a
  backup; it silently discards their uncommitted work.
- **Own stack per session** for anything with queues or workers (port offset +
  project name; `cases-and-verification.md` § 4).
- **Pushes that trigger pipelines go one at a time**: a newer commit can cancel
  the running execution; match the pipeline's revision to your commit.

## 6. Cleaning up

Many sessions share one machine. Each isolated stack is several containers
plus an API, workers and a dev server.

- When a task is done (or paused), stop **every** process and stack **your**
  session started.
- Find a server by its **listening pid** (`ss -ltnp 'sport = :PORT'`), confirm
  `/proc/<pid>/cwd` is your checkout, kill that pid. `pgrep -f` matches the
  shell wrapper, and the stale server keeps answering.
- **Never an unscoped `pkill -f`**: it matches other sessions' commands, and a
  pattern containing a path can kill your own shell.
- `docker compose -p <your project> ... down -v` for an isolated stack.
- **Only your own.** Stacks nobody seems to own are listed for a person to
  decide, never deleted.
- Say what you stopped, and what you left running on purpose, in your report.
