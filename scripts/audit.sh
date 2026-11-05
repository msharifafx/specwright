#!/usr/bin/env bash
# Report which parts of the harness a project has, and what is missing or
# unfilled. Read-only. Run it during discovery on an existing project, and
# again after installing.
#
#   audit.sh <harness-root>
ROOT="${1:-.}"; ROOT="$(cd "$ROOT" && pwd)"
have=0; miss=0; warn=0
y() { echo "  [x] $1"; have=$((have+1)); }
n() { echo "  [ ] $1"; miss=$((miss+1)); }
w() { echo "  [!] $1"; warn=$((warn+1)); }
f() { [ -e "$ROOT/$1" ]; }

echo "Harness audit: $ROOT"
echo
echo "Layout"
top=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$top" = "$ROOT" ]; then echo "  harness root is a git repo"; elif [ -n "$top" ]; then w "harness root is INSIDE repo $top — usually the repo root should be the harness root"; else echo "  harness root is not a git repo (workspace of repos?)"; fi
nested=$(find "$ROOT" -mindepth 2 -maxdepth 3 -name .git -not -path '*/node_modules/*' 2>/dev/null | sed "s#$ROOT/##; s#/.git##" | tr '\n' ' ')
[ -n "$nested" ] && echo "  nested git repos: $nested"
mono=$(cd "$ROOT" && ls pnpm-workspace.yaml nx.json turbo.json lerna.json go.work settings.gradle settings.gradle.kts .gitmodules 2>/dev/null | tr '\n' ' ')
[ -n "$mono" ] && echo "  workspace/monorepo files: $mono"
mans=$(cd "$ROOT" && find . -maxdepth 3 \( -name node_modules -o -name .git -o -name vendor -o -name target \) -prune -o \( -name package.json -o -name pyproject.toml -o -name go.mod -o -name Cargo.toml -o -name pom.xml -o -name 'build.gradle*' -o -name '*.csproj' -o -name Gemfile -o -name composer.json -o -name pubspec.yaml -o -name Package.swift \) -print 2>/dev/null | sed 's#^\./##' | tr '\n' ' ')
echo "  manifests: ${mans:-none}"

echo
echo "Configuration"
f .claude/harness.conf && y ".claude/harness.conf" || n ".claude/harness.conf"
f .claude/harness.units && y ".claude/harness.units" || n ".claude/harness.units"
for c in .claude/harness.conf .claude/harness.units CLAUDE.md; do
  f "$c" && grep -q '__[A-Z_]*__' "$ROOT/$c" && w "$c still has unfilled __PLACEHOLDERS__: $(grep -o '__[A-Z_]*__' "$ROOT/$c" | sort -u | head -8 | tr '\n' ' ')"
done
if [ -f "$ROOT/.claude/hooks/_conf.sh" ] && [ -f "$ROOT/.claude/harness.units" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/.claude/hooks/_conf.sh"
  cnt=0
  while IFS=$'\t' read -r dir exts lint tc inst; do
    cnt=$((cnt+1)); rel="${dir#"$ROOT"}"; rel="${rel#/}"; rel="${rel:-.}"
    [ -d "$dir" ] || { w "unit $rel: directory does not exist"; continue; }
    for kv in "lint:$lint" "typecheck:$tc" "install:$inst"; do
      k="${kv%%:*}"; v="${kv#*:}"
      [ "$v" = "-" ] && { [ "$k" = install ] || w "unit $rel: no $k command"; continue; }
      bin="${v%% *}"; case "$bin" in ./*) [ -e "$dir/$bin" ] || w "unit $rel: $k uses $bin, not found" ;; *) (cd "$dir" && command -v "$bin" >/dev/null) || w "unit $rel: $k uses '$bin', not on PATH here" ;; esac
    done
    echo "  unit $rel  exts=[$exts]"
  done < <(units)
  [ $cnt -gt 0 ] && y "$cnt unit(s) parsed" || n "no units defined in harness.units"
fi

echo
echo "Hooks"
for h in _conf lint gate hotfix; do f ".claude/hooks/$h.sh" && { [ -x "$ROOT/.claude/hooks/$h.sh" ] || [ $h = _conf ]; } && y "hooks/$h.sh" || n "hooks/$h.sh (present and executable)"; done
if f .claude/settings.json; then
  for h in lint gate hotfix; do grep -q "hooks/$h.sh" "$ROOT/.claude/settings.json" && y "settings.json wires $h.sh" || n "settings.json wires $h.sh"; done
else n ".claude/settings.json"; fi
command -v jq >/dev/null && y "jq installed" || n "jq installed (hooks cannot read their input without it)"
f .claude/hotfix-chain && echo "  hotfix chain ARMED: $(grep -v '^#' "$ROOT/.claude/hotfix-chain" | tr -s '\n' ' ')" || echo "  hotfix chain not armed (expected unless branch-per-environment was chosen)"
for r in $nested; do
  [ -f "$ROOT/$r/.claude/settings.json" ] && grep -q 'hooks/lint.sh' "$ROOT/$r/.claude/settings.json" && y "repo $r has its own hook wiring" || w "repo $r has no hook wiring — sessions started inside it are unguarded (run scripts/bootstrap.sh)"
done

echo
echo "Instructions"
f CLAUDE.md && y "CLAUDE.md" || n "CLAUDE.md"
f CLAUDE.md && ! grep -qiE '^#+ .*invariant' "$ROOT/CLAUDE.md" && w "CLAUDE.md has no Invariants section (coding-style 'never' rules are not invariants)"
for o in AGENTS.md .cursorrules .cursor/rules .github/copilot-instructions.md .windsurfrules; do f "$o" && w "other agent instructions: $o — compare with CLAUDE.md for contradictions FIRST, then merge or import"; done
rules=$(find "$ROOT" -path '*/node_modules' -prune -o -path '*/.claude/rules/*.md' -print 2>/dev/null | grep -v _template | wc -l)
[ "$rules" -gt 0 ] && y "$rules path-scoped rule file(s)" || n "path-scoped rule files (.claude/rules/*.md)"
find "$ROOT" -name '*.harness-new' -not -path '*/node_modules/*' 2>/dev/null | sed "s#$ROOT/#  [!] unmerged template: #"

echo
echo "Workflow and records"
f scripts/feature-start.sh && y "scripts/feature-start.sh" || n "scripts/feature-start.sh"
f scripts/feature-end.sh && y "scripts/feature-end.sh" || n "scripts/feature-end.sh"
D="${DOCS_DIR:-docs}"
f "$D/feature-workflow.md" && y "$D/feature-workflow.md" || n "feature workflow doc"
f "${QUESTIONS_FILE:-$D/open-questions.md}" && y "open-questions register" || n "open-questions register"
f "${DECISIONS_FILE:-$D/deferred-decisions.md}" && y "decision log" || n "decision log"
RQ="${REQUIREMENTS_DIR:-$D/requirements}"
find "$ROOT/$RQ" -type f ! -name README.md 2>/dev/null | grep -q . && y "requirement sources in $RQ" || n "requirement sources in $RQ (REQUIREMENTS_DIR may point at an existing folder)"
if [ -n "${CASES_DIR:-}" ]; then
  f "$CASES_DIR" && y "cases dir $CASES_DIR ($(grep -rhoE --exclude=README.md "^\| *[A-Z]{3}-[A-Z0-9]{2,6}-[0-9]{3}" "$ROOT/$CASES_DIR" 2>/dev/null | wc -l) cases)" || n "cases dir $CASES_DIR"
  f "$(dirname "$CASES_DIR")/tools/cases-check.mjs" && y "cases check" || n "cases check tool"
else n "CASES_DIR not set — no cases-as-spec yet"; fi
ci=$(cd "$ROOT" && ls -d .github/workflows .gitlab-ci.yml buildspec*.yml Jenkinsfile azure-pipelines.yml bitbucket-pipelines.yml */buildspec*.yml 2>/dev/null | tr '\n' ' ')
[ -n "$ci" ] && echo "  CI config: $ci (check the gate is the SAME command CI runs)" || w "no CI config found — the local gate is the only gate"
if [ -n "${GATE_CMD:-}" ]; then
  gbin="${GATE_CMD%% *}"
  if [ -e "$ROOT/$gbin" ] || (cd "$ROOT" && command -v "$gbin" >/dev/null); then y "gate command: $GATE_CMD"; else w "gate command '$GATE_CMD': '$gbin' not found from the harness root"; fi
  f scripts/gate.sh && grep -q '__[A-Z_]*__' "$ROOT/scripts/gate.sh" && w "scripts/gate.sh still has unfilled steps"
else n "GATE_CMD in harness.conf"; fi

echo
echo "present $have · missing $miss · warnings $warn"
[ $miss -eq 0 ]
