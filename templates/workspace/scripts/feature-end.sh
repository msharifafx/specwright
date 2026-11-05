#!/usr/bin/env bash
# Remove a feature worktree set created by feature-start.sh.
#
# Never forces: git refuses a dirty worktree, and uncommitted work is a reason
# to stop, not to delete. Branches live in the main checkout and SURVIVE.
set -euo pipefail

. "$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/_conf.sh"
ROOT="$HARNESS_ROOT"

name="${1:?usage: feature-end.sh <worktree-dir-name>}"
wt="$(dirname "$ROOT")/$name"
[ -d "$wt" ] || { echo "no such directory: $wt" >&2; exit 1; }

# Nested worktrees first (separate repos), then the root one if any.
roots=$(git_roots)
while IFS= read -r r; do
  [ "$r" = "$ROOT" ] && continue
  t="$wt/${r#"$ROOT"/}"
  [ -e "$t/.git" ] && { echo "removing $t"; git -C "$r" worktree remove "$t"; }
done <<<"$roots"
if grep -qx "$ROOT" <<<"$roots" && [ -e "$wt/.git" ]; then
  echo "removing $wt"; git -C "$ROOT" worktree remove "$wt"
fi

rm -rf "$wt"
while IFS= read -r r; do git -C "$r" worktree prune; done <<<"$roots"
echo "done: $name"
