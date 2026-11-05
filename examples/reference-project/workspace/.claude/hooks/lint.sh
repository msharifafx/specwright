#!/usr/bin/env bash
# Lints the file Claude just wrote, in whichever repo owns it.
#
# Identical copy lives at the workspace root and in each repo, because
# .claude/settings.json is read from the SESSION's project root only — a
# settings.json inside a subdirectory is never loaded. Whichever directory the
# session starts in, that directory's copy runs.
#
# The repo is resolved by walking UP from the edited file, so one script covers
# a session started at the workspace root, inside a repo, or in a worktree.

command -v jq >/dev/null || { echo 'lint hook: jq not installed — file NOT linted'; exit 0; }

f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
case "$f" in *.ts|*.tsx) ;; *) exit 0 ;; esac

case "$f" in /*) abs="$f" ;; *) abs="$PWD/$f" ;; esac
[ -f "$abs" ] || exit 0

dir=$(dirname "$abs")
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  if [ -x "$dir/node_modules/.bin/eslint" ]; then
    (cd "$dir" && ./node_modules/.bin/eslint --fix "$abs" 2>&1 | head -40)
    exit 0
  fi
  # A package.json with no eslint means deps were never installed here — the
  # usual cause is a fresh worktree. Say so; silence would read as "clean".
  if [ -f "$dir/package.json" ]; then
    echo "lint hook: $abs NOT linted — no eslint in $dir. Run: (cd $dir && pnpm install)"
    exit 0
  fi
  dir=$(dirname "$dir")
done

echo "lint hook: $abs NOT linted — no package.json found in any parent directory."
exit 0
