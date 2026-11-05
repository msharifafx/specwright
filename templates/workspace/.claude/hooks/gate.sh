#!/usr/bin/env bash
# Stop hook: block the turn from ending while typecheck fails in any unit with
# uncommitted changes.
#
# WHY TYPECHECK AND NOT THE FULL GATE. Lint runs per file on every edit; the
# gap it cannot see is cross-file breakage. Typecheck closes that in seconds.
# The full gate is too slow for every turn and runs before a PR.
#
#  * exit 2 blocks and feeds stderr back to the model; exit 1 is a hook ERROR
#    and is ignored. A gate that exits 1 gates nothing.
#  * stop_hook_active is true on the turn this hook already blocked once;
#    without the check it re-fires forever.
#  * A red result can mean the hook's shell could not find the toolchain —
#    hooks run non-interactively. Run the command yourself before chasing it.
. "$(dirname "$0")/_conf.sh"

INPUT=$(cat)
if command -v jq >/dev/null && [ "$(jq -r '.stop_hook_active // false' <<<"$INPUT")" = "true" ]; then
  exit 0
fi

FAILED=""
while IFS=$'\t' read -r dir exts _ tc _; do
  [ -n "$tc" ] && [ "$tc" != "-" ] || continue
  git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || continue
  # Changed files in THIS unit with one of its extensions.
  changed=$(git -C "$dir" status --porcelain --untracked-files=all -- . 2>/dev/null | awk '{print $NF}')
  hit=0
  for e in $exts; do grep -qE "\.${e}$" <<<"$changed" && hit=1; done
  [ "$hit" = 1 ] || continue
  OUT=$(cd "$dir" && bash -lc "$tc" 2>&1)
  if [ $? -ne 0 ]; then
    FAILED="${FAILED}
--- ${dir#"$HARNESS_ROOT"/} ---
$(echo "$OUT" | grep -E 'error|Error|✖|:[0-9]+:' | head -20)"
  fi
done < <(units)

if [ -n "$FAILED" ]; then
  { echo "typecheck FAILED — fix before finishing."; echo "$FAILED"; } >&2
  exit 2
fi
exit 0
