#!/usr/bin/env bash
# Workspace-of-repos layout only: clone each unit that is its own repo, install
# its dependencies, and give it a copy of the hooks (a session may start
# inside it). Idempotent. Single repos and monorepos do not need this.
#
#   GIT_BASE=git@github.com:your-org ./scripts/bootstrap.sh
set -euo pipefail

. "$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/_conf.sh"
ROOT="$HARNESS_ROOT"
GIT_BASE="${GIT_BASE_OVERRIDE:-${GIT_BASE:-}}"

while IFS=$'\t' read -r dir exts lint tc inst; do
  [ "$dir" = "$ROOT" ] && continue
  rel="${dir#"$ROOT"/}"
  if [ ! -d "$dir" ]; then
    case "$GIT_BASE" in ""|__*) echo "$rel: missing and GIT_BASE unset — set it in .claude/harness.conf"; continue ;; esac
    git clone "$GIT_BASE/$(basename "$rel").git" "$dir"
  elif [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only -q || echo "$rel: pull skipped"
  fi
  [ -n "$inst" ] && [ "$inst" != "-" ] && (cd "$dir" && bash -lc "$inst")

  # A repo of its own gets its own hook copy and a unit table naming only
  # itself, because a session started inside it reads only its .claude/.
  if [ -d "$dir/.git" ]; then
    mkdir -p "$dir/.claude/hooks"
    cp "$ROOT/.claude/hooks/"*.sh "$dir/.claude/hooks/"
    [ -f "$dir/.claude/settings.json" ] || cp "$ROOT/.claude/settings.json" "$dir/.claude/settings.json"
    cp "$ROOT/.claude/harness.conf" "$dir/.claude/harness.conf"
    printf '[%s]\npath = .\nexts = %s\nlint = %s\ntypecheck = %s\ninstall = %s\n' \
      "$(basename "$rel")" "$exts" "$lint" "$tc" "$inst" >"$dir/.claude/harness.units"
  fi
  echo "$rel: ready"
done < <(units)
