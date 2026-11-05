#!/usr/bin/env bash
# Stop hook: propagate a hotfix down the branch chain, LOCALLY.
#
# Identical copy at the workspace root and in each repo, for the same reason as
# lint.sh — .claude/settings.json is read from the SESSION's project root only.
# The script finds its own repo from its path and also picks up the two app
# repos when it is the root copy running, so one file covers every start point.
#
# WHAT IT DOES NOT DO: push, deploy, or fetch. Everything here is local history
# rewriting-adjacent work, and pushing is outward-facing. The propagated
# branches sit in your clone until you push them yourself; that push is what
# triggers a pipeline.
#
# INERT BY DEFAULT. A repo participates only if it has .claude/hotfix-chain.
# No chain file, no behaviour.

set -uo pipefail
. "$(dirname "$0")/_conf.sh"

INPUT=$(cat)

# Without this the hook re-fires on the turn it just blocked. gate.sh has the
# same guard and the same reason.
if command -v jq >/dev/null && [ "$(jq -r '.stop_hook_active // false' <<<"$INPUT")" = "true" ]; then
  exit 0
fi

# A hotfix commit is one whose subject starts with `hotfix:` / `hotfix(scope):`
# / `hotfix!:`. Nothing else propagates — this hook must never move an ordinary
# feature commit between branches.
HOTFIX_RE='^hotfix(\([^)]*\))?!?:'

REPORT=""

note() { REPORT="${REPORT}
$1"; }

propagate() {
  local dir="$1" name="$2"
  local chain_file="$dir/.claude/hotfix-chain"
  [ -f "$chain_file" ] || return 0
  git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || return 0

  # A feature worktree holds the chain file too (feature-start.sh copies
  # .claude wholesale), but its chain branches are checked out in the main
  # checkout — so every attempt would fail there. Propagation is a
  # main-checkout job; a linked worktree says nothing rather than nagging.
  if [ "$(git -C "$dir" rev-parse --git-dir)" != "$(git -C "$dir" rev-parse --git-common-dir)" ]; then
    return 0
  fi

  local branches=()
  local line
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [ -n "$line" ] && branches+=("$line")
  done <"$chain_file"

  if [ "${#branches[@]}" -lt 2 ]; then
    note "$name: hotfix-chain needs at least two branches — skipped."
    return 0
  fi

  # Merging rewrites the working tree. Refusing on a dirty tree is not caution,
  # it is the only way this can be safe to run unattended.
  if [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then
    local pending_any=0 i
    for ((i = 0; i < ${#branches[@]} - 1; i++)); do
      git -C "$dir" rev-parse --verify --quiet "${branches[i]}" >/dev/null || continue
      git -C "$dir" rev-parse --verify --quiet "${branches[i + 1]}" >/dev/null || continue
      if git -C "$dir" log --format='%s' "${branches[i + 1]}..${branches[i]}" 2>/dev/null | grep -qE "$HOTFIX_RE"; then
        pending_any=1
      fi
    done
    if [ "$pending_any" = 1 ]; then
      note "$name: hotfix waiting to propagate, but the working tree is dirty. Commit or stash, then finish a turn."
    fi
    return 0
  fi

  local orig
  orig=$(git -C "$dir" branch --show-current)
  [ -n "$orig" ] || { note "$name: detached HEAD — hotfix propagation skipped."; return 0; }

  local i src dst pending subjects out
  for ((i = 0; i < ${#branches[@]} - 1; i++)); do
    src="${branches[i]}"
    dst="${branches[i + 1]}"

    git -C "$dir" rev-parse --verify --quiet "$src" >/dev/null || continue
    git -C "$dir" rev-parse --verify --quiet "$dst" >/dev/null || {
      note "$name: $dst does not exist — chain stops at $src."
      break
    }

    pending=$(git -C "$dir" log --format='%h %s' "$dst..$src" 2>/dev/null | grep -E "^[0-9a-f]+ ${HOTFIX_RE#^}" || true)
    [ -n "$pending" ] || continue
    # The merge commits this hook writes also match HOTFIX_RE — that is how the
    # fix keeps moving down the chain — but they are not the fix, so they are
    # not what gets reported.
    subjects=$(echo "$pending" | grep -v ' hotfix: propagate ' | sed 's/^[0-9a-f]* /      /' || true)
    [ -n "$subjects" ] || subjects="      (carried by an earlier propagation merge)"

    # A branch checked out in a feature worktree cannot be checked out here.
    # git says so itself, so let it, and report rather than guess.
    if ! out=$(git -C "$dir" checkout -q "$dst" 2>&1); then
      note "$name: cannot check out $dst — $out"
      break
    fi

    if git -C "$dir" merge --no-ff --no-edit -m "hotfix: propagate $src into $dst" "$src" >/dev/null 2>&1; then
      note "$name: propagated $src → $dst
$subjects"
    else
      git -C "$dir" merge --abort 2>/dev/null
      note "$name: CONFLICT merging $src → $dst. Cascade stopped here — everything downstream of $dst is untouched, so no branch carries half a fix. Resolve by hand:
    (cd $dir && git checkout $dst && git merge --no-ff $src)"
      break
    fi
  done

  git -C "$dir" checkout -q "$orig" 2>/dev/null
}

# Every git working tree the units live in (one for a monorepo, several
# for separate repos).
while IFS= read -r dir; do
  propagate "$dir" "$(basename "$dir")"
done < <(git_roots)

if [ -n "$REPORT" ]; then
  {
    echo "HOTFIX PROPAGATION${REPORT}"
    echo ""
    echo "Local only — nothing was pushed. Push the propagated branches yourself to deploy."
  } >&2
  exit 2
fi

exit 0
