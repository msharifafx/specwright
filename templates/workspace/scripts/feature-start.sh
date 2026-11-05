#!/usr/bin/env bash
# Start a feature: a git worktree for every git repo the units live in, all on
# feat/<name>, under one directory that mirrors the harness root — so a
# session opened there behaves exactly as it does here.
#
#   ./scripts/feature-start.sh orders-bulk-export
#
# Works for every layout harness.units can describe:
#   single repo / monorepo  → one worktree, the whole repo
#   workspace of repos      → a worktree per repo, at the same relative path
#
# WHY A WORKTREE PER FEATURE. Several sessions (people or agents) work at once.
# In a shared checkout one session's `git add -A` commits another's
# half-finished files, and a branch switch moves the floor under everyone.
set -euo pipefail

. "$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/_conf.sh"
ROOT="$HARNESS_ROOT"

FEAT="${1:?usage: feature-start.sh <feature-name>}"
BRANCH="feat/${FEAT}"
DEST="$(dirname "$ROOT")/${WORKTREE_PREFIX:-feat-}${FEAT}"
[ -e "$DEST" ] && { echo "ERROR: $DEST already exists."; exit 1; }

add_worktree() {   # <repo root> <destination>
  local repo="$1" dest="$2" base
  # Branch from an UP-TO-DATE default branch. A worktree cut from a stale one
  # fails the gate in files you never touched.
  git -C "$repo" fetch -q 2>/dev/null || true
  base=$(git -C "$repo" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || git -C "$repo" branch --show-current)
  git -C "$repo" worktree add -q "$dest" -b "$BRANCH" "$base"
  echo "worktree: $dest  ($BRANCH from $base)"
}

roots=$(git_roots)
[ -n "$roots" ] || { echo "ERROR: no unit in .claude/harness.units is inside a git repo."; exit 1; }

# The harness root itself first, when it is a repo (single repo / monorepo).
if grep -qx "$ROOT" <<<"$roots"; then add_worktree "$ROOT" "$DEST"; else mkdir -p "$DEST"; fi

while IFS= read -r r; do
  [ "$r" = "$ROOT" ] && continue
  case "$r" in "$ROOT"/*) ;; *)
    echo "ERROR: $r is outside $ROOT. Put sibling repos under one workspace directory"
    echo "       (the harness root) so a feature can mirror it."; exit 1 ;;
  esac
  add_worktree "$r" "$DEST/${r#"$ROOT"/}"
done <<<"$roots"

# Instructions and hooks that are not tracked by git do not come with a
# worktree. Copy them, without overwriting tracked copies.
[ -f "$DEST/CLAUDE.md" ] || cp "$ROOT/CLAUDE.md" "$DEST/CLAUDE.md" 2>/dev/null || true
mkdir -p "$DEST/.claude"; cp -rn "$ROOT/.claude/." "$DEST/.claude/"

# STEP ZERO: dependencies in every unit. Without them the lint hook reports
# "NOT linted" on every edit and the gate fails.
while IFS=$'\t' read -r dir _ _ _ inst; do
  rel="${dir#"$ROOT"}"; rel="${rel#/}"; target="$DEST${rel:+/$rel}"
  # .env is gitignored, so a worktree starts without one. Copied, not linked,
  # so a feature can use its own ports without touching the main checkout.
  [ -f "$dir/.env" ] && [ ! -f "$target/.env" ] && cp "$dir/.env" "$target/.env"
  [ -n "$inst" ] && [ "$inst" != "-" ] || continue
  echo "install: ${rel:-.}"; (cd "$target" && bash -lc "$inst" >/dev/null)
done < <(units)

cat <<MSG

Ready: $DEST
  cd $DEST && claude
Finish: $ROOT/scripts/feature-end.sh $(basename "$DEST")
MSG
