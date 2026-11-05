#!/usr/bin/env bash
# Self-test for the harness templates. Builds throwaway projects in a temp
# directory — a monorepo and a workspace of two repos — installs the hooks,
# and exercises lint.sh, gate.sh, feature-start.sh and feature-end.sh against
# fake linters and typecheckers. Touches nothing outside its temp directory.
set -uo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  ok   $1"; pass=$((pass+1)); }
bad() { echo "  FAIL $1"; fail=$((fail+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

install_into() {  # <root> <units text>
  mkdir -p "$1/.claude" "$1/scripts"
  cp -r "$SKILL/templates/workspace/.claude/hooks" "$1/.claude/"
  cp "$SKILL/templates/workspace/.claude/settings.json" "$1/.claude/"
  sed -e 's/__WORKTREE_PREFIX__/t-/' -e 's/__[A-Z_]*__//g' "$SKILL/templates/workspace/.claude/harness.conf" >"$1/.claude/harness.conf"
  printf '%s\n' "$2" >"$1/.claude/harness.units"
  cp "$SKILL/templates/workspace/scripts/"*.sh "$1/scripts/"
  echo "# $(basename "$1")" >"$1/CLAUDE.md"
}
gitinit() { git -C "$1" init -q -b main; git -C "$1" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init; }

echo "== monorepo: two units, different toolchains"
M="$T/mono"; mkdir -p "$M/web" "$M/api"
install_into "$M" "[web]
path = web
exts = ts
lint = echo LINTED-TS {file} | cat
typecheck = grep -q BROKEN src.ts && exit 1 || true

[api]
path = api
exts = py
lint = echo LINTED-PY {file}"
echo ok >"$M/web/src.ts"; gitinit "$M"
out=$(echo "{\"tool_input\":{\"file_path\":\"$M/web/src.ts\"}}" | "$M/.claude/hooks/lint.sh")
check "lint picks the web unit's linter" '[[ $out == LINTED-TS* ]]'
echo x >"$M/api/a.py"
out=$(echo "{\"tool_input\":{\"file_path\":\"$M/api/a.py\"}}" | "$M/.claude/hooks/lint.sh")
check "lint picks the api unit's linter" '[[ $out == LINTED-PY* ]]'
echo x >"$M/README.md"
out=$(echo "{\"tool_input\":{\"file_path\":\"$M/README.md\"}}" | "$M/.claude/hooks/lint.sh")
check "lint ignores a file no unit owns" '[ -z "$out" ]'
echo '{}' | "$M/.claude/hooks/gate.sh" >/dev/null 2>&1; rc=$?
check "gate passes with a clean typecheck" '[ $rc -eq 0 ]'
echo BROKEN >"$M/web/src.ts"
echo '{}' | "$M/.claude/hooks/gate.sh" >/dev/null 2>&1; rc=$?
check "gate blocks (exit 2) on a failing typecheck" '[ $rc -eq 2 ]'
echo '{"stop_hook_active":true}' | "$M/.claude/hooks/gate.sh" >/dev/null 2>&1; rc=$?
check "gate does not re-fire when stop_hook_active" '[ $rc -eq 0 ]'
echo ok >"$M/web/src.ts"
git -C "$M" add -A; git -C "$M" -c user.email=t@t -c user.name=t commit -q -m files
(cd "$M" && ./scripts/feature-start.sh demo >/dev/null 2>&1); 
check "feature-start makes one worktree for a monorepo" '[ -e "$T/t-demo/.git" ] && [ -f "$T/t-demo/.claude/harness.units" ]'
check "worktree is on feat/demo" '[ "$(git -C "$T/t-demo" branch --show-current)" = feat/demo ]'
(cd "$M" && ./scripts/feature-end.sh t-demo >/dev/null 2>&1)
check "feature-end removes it, branch survives" '[ ! -e "$T/t-demo" ] && git -C "$M" rev-parse -q --verify feat/demo >/dev/null'

echo "== workspace of two separate repos"
W="$T/ws"; mkdir -p "$W/server" "$W/web"
install_into "$W" "[server]
path = server
exts = ts
lint = echo S {file}
typecheck = true
install = true

[web]
path = web
exts = ts
lint = echo W {file}
install = true"
gitinit "$W/server"; gitinit "$W/web"
(cd "$W" && ./scripts/feature-start.sh two >/dev/null 2>&1)
check "a worktree per repo at the mirrored path" '[ -e "$T/t-two/server/.git" ] && [ -e "$T/t-two/web/.git" ]'
check "workspace CLAUDE.md and hooks copied" '[ -f "$T/t-two/CLAUDE.md" ] && [ -x "$T/t-two/.claude/hooks/lint.sh" ]'
echo x >"$T/t-two/web/x.ts"
out=$(echo "{\"tool_input\":{\"file_path\":\"$T/t-two/web/x.ts\"}}" | "$T/t-two/.claude/hooks/lint.sh")
check "lint inside the worktree resolves its own unit" '[[ $out == W* ]]'
(cd "$W" && ./scripts/feature-end.sh t-two >/dev/null 2>&1)
check "feature-end refuses a worktree with uncommitted work" '[ -f "$T/t-two/web/x.ts" ]'
rm "$T/t-two/web/x.ts"
(cd "$W" && ./scripts/feature-end.sh t-two >/dev/null 2>&1)
check "feature-end removes both once clean" '[ ! -e "$T/t-two" ]'
(cd "$W" && ./scripts/bootstrap.sh >/dev/null 2>&1)
check "bootstrap gives each repo its own hooks and unit table" '[ -x "$W/web/.claude/hooks/gate.sh" ] && grep -qx "path = \." "$W/web/.claude/harness.units"'

echo "== lint reports a missing linter loudly"
N="$T/nolint"; mkdir -p "$N"
install_into "$N" "[app]
path = .
exts = ts
lint = ./node_modules/.bin/eslint {file}"
echo x >"$N/a.ts"
out=$(echo "{\"tool_input\":{\"file_path\":\"$N/a.ts\"}}" | "$N/.claude/hooks/lint.sh")
check "says NOT linted when the linter is absent" '[[ $out == *"NOT linted"* ]]'

echo "== hotfix propagation"
gitc() { git -C "$M" -c user.email=t@t -c user.name=t "$@"; }
gitc branch -q uat; gitc branch -q release
printf 'release\nuat\nmain\n' >"$M/.claude/hotfix-chain"
echo '.claude/hotfix-chain' >>"$M/.git/info/exclude"
gitc checkout -q release; echo fix >"$M/web/fix.ts"; gitc add web/fix.ts; gitc commit -q -m "hotfix: the fix"; gitc checkout -q main
echo '{}' | "$M/.claude/hooks/hotfix.sh" >/dev/null 2>&1; rc=$?
check "hotfix merges release -> uat -> main and reports (exit 2)" '[ $rc -eq 2 ] && gitc log --oneline main | grep -q "hotfix: the fix"'
gitc checkout -q release; echo feat >"$M/web/feat.ts"; gitc add web/feat.ts; gitc commit -q -m "feat: not a fix"; gitc checkout -q main
echo '{}' | "$M/.claude/hooks/hotfix.sh" >/dev/null 2>&1
check "an ordinary commit does not move" '! gitc log --oneline main | grep -q "not a fix"'
rm "$M/.claude/hotfix-chain"

echo "== cases check"
C="$T/cases"; mkdir -p "$C/cases" "$C/tests"
printf '| ID | Case | Steps | Expected |\n|--|--|--|--|\n| ABC-XY-001 | a | b | c |\n| ABC-XY-002 SKIP | a | b | Not yet; unlike ABC-XY-003 |\n' >"$C/cases/s.md"
printf "test('ABC-XY-001 works', () => {})\n" >"$C/tests/s.spec.ts"
(cd "$C" && node "$SKILL/templates/e2e/tools/cases-check.mjs" >/dev/null 2>&1); rc=$?
check "passes when every case is scripted or SKIP (a reference in a SKIP reason is not a definition)" '[ $rc -eq 0 ]'
printf "test('ABC-XY-009 orphan', () => {})\n" >>"$C/tests/s.spec.ts"
(cd "$C" && node "$SKILL/templates/e2e/tools/cases-check.mjs" >/dev/null 2>&1); rc=$?
check "fails on a script with no case" '[ $rc -ne 0 ]'

echo "== installer merges into an existing project"
P="$T/existing"; mkdir -p "$P/.claude"; git -C "$P" init -q
echo '{"permissions":{"allow":["Bash(ls)"]},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo mine"}]}]}}' >"$P/.claude/settings.json"
echo "# our rules" >"$P/CLAUDE.md"
printf '[app]\npath = .\nexts = ts\nlint = echo L {file}\n' >"$T/u"
"$SKILL/scripts/install.sh" "$P" --units "$T/u" >/dev/null 2>&1
check "existing Stop hook and permissions kept" 'jq -e ".permissions.allow[0]==\"Bash(ls)\" and ([.hooks.Stop[].hooks[].command]|index(\"echo mine\")!=null)" "$P/.claude/settings.json" >/dev/null'
check "harness hooks wired" 'jq -e "[.hooks[][].hooks[].command]|index(\".claude/hooks/gate.sh\")!=null" "$P/.claude/settings.json" >/dev/null'
check "existing CLAUDE.md untouched, template beside it" '[ "$(cat "$P/CLAUDE.md")" = "# our rules" ] && [ -f "$P/CLAUDE.md.harness-new" ]'
"$SKILL/scripts/install.sh" "$P" --units "$T/u" >/dev/null 2>&1
check "second install adds no duplicate hooks" '[ "$(jq "[.hooks.Stop[].hooks[]]|length" "$P/.claude/settings.json")" = 3 ]'

echo; echo "passed $pass, failed $fail"; [ $fail -eq 0 ]
