#!/usr/bin/env bash
# Remove a feature worktree set created by feature-start.sh.
#
# Removes each repo's worktree (git refuses a dirty tree unless you pass --force,
# which this script deliberately does not), then deletes the wrapper directory.
# The branch ref lives in the main checkout and SURVIVES — no commit is lost.
set -euo pipefail

WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="${1:?usage: feature-end.sh <worktree-dir-name>   e.g. app-feat-checker-edit}"
wt="$(dirname "$WS")/$name"

[ -d "$wt" ] || { echo "no such directory: $wt" >&2; exit 1; }

for repo in server-app web-app e2e-app; do
  [ -e "$wt/$repo/.git" ] || continue
  echo "removing $wt/$repo"
  git -C "$WS/$repo" worktree remove "$wt/$repo"
done

# Single-repo worktrees (e.g. app-web-feat-brand-chrome) are the wrapper itself.
if [ -e "$wt/.git" ]; then
  for repo in server-app web-app e2e-app; do
    if git -C "$WS/$repo" worktree list --porcelain | grep -qx "worktree $wt"; then
      echo "removing $wt (worktree of $repo)"
      git -C "$WS/$repo" worktree remove "$wt"
    fi
  done
fi

rm -rf "$wt"
for repo in server-app web-app e2e-app; do
  git -C "$WS/$repo" worktree prune
done
echo "done: $name"
