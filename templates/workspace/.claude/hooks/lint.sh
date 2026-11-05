#!/usr/bin/env bash
# PostToolUse hook: lint the file just written, with the linter of the unit
# that owns it (harness.units).
#
# WHY A HOOK AND NOT AN INSTRUCTION. A rule the agent may forget is a hope; a
# lint error in the same step as the edit is a rule. Always exits 0: a finding
# is information for the agent, not a hook failure.
. "$(dirname "$0")/_conf.sh"

command -v jq >/dev/null || { echo 'lint hook: jq not installed — file NOT linted'; exit 0; }

f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
case "$f" in /*) abs="$f" ;; *) abs="$PWD/$f" ;; esac
[ -f "$abs" ] || exit 0

row=$(unit_for "$abs")
[ -n "$row" ] || exit 0
IFS=$'\t' read -r dir exts lint _ _ <<<"$row"

ext="${abs##*.}"
case " $exts " in *" $ext "*) ;; *) exit 0 ;; esac
[ "$lint" = "-" ] || [ -z "$lint" ] && exit 0

cmd="${lint//\{file\}/\"$abs\"}"
out=$(cd "$dir" && bash -lc "$cmd" 2>&1); rc=$?
# 127 = command not found: almost always a fresh worktree with no
# dependencies installed. Say so — silence would read as "clean".
if [ $rc -eq 127 ] || grep -qiE 'command not found|cannot find module|no such file' <<<"$out" && [ $rc -ne 0 ]; then
  echo "lint hook: $abs NOT linted — the linter did not run in $dir. Install dependencies there. ($out)" | head -5
  exit 0
fi
echo "$out" | head -40
exit 0
