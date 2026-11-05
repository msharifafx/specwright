# Records and parallel work

## Contents

1. Team lessons, in the repo
2. The decision log
3. The open-questions register
4. The defect tracker
5. Worktrees and parallel sessions
6. Cleaning up

---

## 1. Team lessons, in the repo

When something costs an hour, write it down where **every** developer's agent
will read it in every later session. This is where the speed compounds: a trap
paid for once is never paid for again — by anyone on the team.

Lessons live **in the repo**, at `lessons_dir` (default `docs/lessons/`):

- `INDEX.md` — one line per lesson: `- [Title naming the trap](file.md) — the
  symptom you will see`. `CLAUDE.md` imports it with `@<lessons_dir>/INDEX.md`,
  so it is in context from the first message of every session.
- One file per lesson, from `_template.md`: symptom, cause, what to do
  instead, why it was written down, who added it and when.
- Lessons are reviewed in pull requests like code, so a wrong one is caught
  and a good one reaches everyone with the next pull.

Rules for writing them:

- **Name the trap, not the topic**: "Kill a dev server by its listening pid",
  not "Process management".
- **Symptom first.** It is what the next person will actually see.
- **Say why**, so a later reader can tell when it no longer applies.
- **Do not record what the repo already says** (code structure, git history,
  the instructions file).
- **Update, do not duplicate; delete lessons that turn out wrong.**
- **Promote**: a lesson that fires every week becomes a script, a lint rule or
  a line in `CLAUDE.md` — then delete the lesson.
- **Keep the index short.** It loads every session. If it grows past a screen,
  promote or prune.

**Personal Claude memory is for personal preferences only** — how you like
answers written, your editor, your local paths. Anything another developer
would also trip over belongs in the team lessons, not in one person's memory
folder where nobody else can see it.

Sample lessons from the reference project:

| Trap | Symptom | Lesson says |
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

`decisions_file` (template `templates/workspace/docs/deferred-decisions.md`;
standard tier and up). Every deliberate "not now", every choice between two
readings, every departure from Specwright's opinions. Each entry: status,
current behaviour, the reasoning with sources, and what must be true before it
is picked up. A settled question is looked up, not argued again. Check it
before designing anything touching roles, approvals, money or reports.

A decision living only in a commit message is a decision nobody finds.

## 3. The open-questions register

`questions_file` (template `templates/workspace/docs/open-questions.md`). The
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
  name everywhere (including the cases repo): `node scripts/feature-start.mjs <name>`.
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
- Find a server by its **listening pid**, confirm it is your checkout's, kill
  that pid. Matching by name or command line finds the shell wrapper, and the
  stale server keeps answering.
  - macOS/Linux: `lsof -nP -iTCP:<port> -sTCP:LISTEN` → pid →
    `lsof -p <pid> | grep cwd` → `kill <pid>`
  - Windows: `netstat -ano | findstr :<port>` → pid →
    `tasklist /fi "pid eq <pid>"` (its command line is in Task Manager's
    Details tab) → `taskkill /pid <pid>`
- **Never an unscoped `pkill -f` or `taskkill /im node.exe`**: it matches
  other sessions' processes, and can kill your own shell or editor.
- `docker compose -p <your project> ... down -v` for an isolated stack.
- **Only your own.** Stacks nobody seems to own are listed for a person to
  decide, never deleted.
- Say what you stopped, and what you left running on purpose, in your report.
