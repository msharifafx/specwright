#!/usr/bin/env bash
# Stop hook for a WORKSPACE-ROOT session. Gates whichever repos have changes.
#
# See server-app/.claude/hooks/gate.sh for why stop_hook_active must
# be checked and why blocking is exit 2 rather than exit 1.

INPUT=$(cat)

if command -v jq >/dev/null && [ "$(jq -r '.stop_hook_active // false' <<<"$INPUT")" = "true" ]; then
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=""

for repo in server-app web-app; do
  dir="$ROOT/$repo"
  [ -x "$dir/node_modules/.bin/eslint" ] || continue
  git -C "$dir" status --porcelain -- '*.ts' '*.tsx' 2>/dev/null | grep -q . || continue

  OUT=$(cd "$dir" && pnpm typecheck 2>&1)
  if [ $? -ne 0 ]; then
    FAILED="${FAILED}
--- ${repo} ---
$(echo "$OUT" | grep -E 'error|warning|\.tsx?:|✖' | head -20)"
  fi
done

if [ -n "$FAILED" ]; then
  {
    echo "typecheck FAILED — fix before finishing (CLAUDE.md rule 36)."
    echo "$FAILED"
  } >&2
  exit 2
fi

exit 0
