#!/usr/bin/env bash
# Install the harness into a project. Safe on an EXISTING project: it merges,
# and never overwrites a file the project already has.
#
#   install.sh <harness-root> [--conf FILE] [--units FILE] [--dry-run]
#
#   <harness-root>  where sessions will start: the repo root (single repo,
#                   monorepo) or the workspace directory (workspace of repos)
#   --conf FILE     a filled harness.conf (from the interview)
#   --units FILE    a filled harness.units (from the interview)
#   --dry-run       print what would happen, change nothing
#
# What it does:
#   .claude/hooks/*.sh          harness-owned: written/updated
#   .claude/settings.json       hooks MERGED into an existing file (jq)
#   .claude/harness.conf|units  from --conf/--units; else template if absent
#   scripts/feature-*.sh        written if absent; else <name>.harness-new
#   docs templates, CLAUDE.md,  written only if absent; an existing CLAUDE.md
#   rule template, cases kit    is left alone and reported for merging
# Finally runs audit.sh.
set -euo pipefail

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
T="$SKILL/templates"
ROOT="${1:?usage: install.sh <harness-root> [--conf FILE] [--units FILE] [--dry-run]}"; shift
CONF_IN="" UNITS_IN="" DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --conf) CONF_IN="$2"; shift 2 ;;
    --units) UNITS_IN="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
[ -d "$ROOT" ] || { echo "no such directory: $ROOT" >&2; exit 1; }
ROOT="$(cd "$ROOT" && pwd)"
command -v jq >/dev/null || { echo "jq is required (the hooks need it too)" >&2; exit 1; }

NOTES=()
do_() { if [ $DRY = 1 ]; then echo "would: $*"; else "$@"; fi; }
note() { NOTES+=("$1"); }

# place <src> <dest>: write if absent; if present and different, write
# <dest>.harness-new beside it and report. Never overwrites project files.
place() {
  local src="$1" dest="$2"
  do_ mkdir -p "$(dirname "$dest")"
  if [ ! -e "$dest" ]; then do_ cp "$src" "$dest"; echo "added    ${dest#"$ROOT"/}"
  elif cmp -s "$src" "$dest"; then echo "same     ${dest#"$ROOT"/}"
  else do_ cp "$src" "$dest.harness-new"; echo "exists   ${dest#"$ROOT"/} (template saved as .harness-new)"
       note "Merge ${dest#"$ROOT"/}.harness-new into ${dest#"$ROOT"/} by hand, then delete it."
  fi
}

echo "== hooks"
do_ mkdir -p "$ROOT/.claude/hooks"
for h in "$T"/workspace/.claude/hooks/*.sh; do
  do_ cp "$h" "$ROOT/.claude/hooks/"; do_ chmod +x "$ROOT/.claude/hooks/$(basename "$h")"
  echo "wrote    .claude/hooks/$(basename "$h")"
done
place "$T/workspace/.claude/hotfix-chain.example" "$ROOT/.claude/hotfix-chain.example"

echo "== settings.json (merge)"
S="$ROOT/.claude/settings.json"
if [ ! -f "$S" ]; then do_ cp "$T/workspace/.claude/settings.json" "$S"; echo "added    .claude/settings.json"
else
  # Per event, append template entries whose command is not already wired.
  merged=$(jq -s '
    .[0] as $a | .[1] as $b
    | reduce ($b.hooks | keys[]) as $ev ($a;
        ([.hooks[$ev][]?.hooks[]?.command]) as $cmds
        | ($b.hooks[$ev] | map(.hooks |= map(select(.command as $c | ($cmds | index($c)) == null)))
                         | map(select(.hooks | length > 0))) as $new
        | .hooks[$ev] = ((.hooks[$ev] // []) + $new))' "$S" "$T/workspace/.claude/settings.json")
  if [ "$(jq -S . "$S")" = "$(jq -S . <<<"$merged")" ]; then echo "same     .claude/settings.json"
  else do_ cp "$S" "$S.bak"; [ $DRY = 1 ] || printf '%s\n' "$merged" >"$S"; echo "merged   .claude/settings.json (backup .bak)"; fi
fi

echo "== harness.conf / harness.units"
for pair in "conf:$CONF_IN" "units:$UNITS_IN"; do
  kind="${pair%%:*}"; given="${pair#*:}"; dest="$ROOT/.claude/harness.$kind"
  if [ -n "$given" ]; then do_ cp "$given" "$dest"; echo "wrote    .claude/harness.$kind (from $given)"
  elif [ ! -f "$dest" ]; then do_ cp "$T/workspace/.claude/harness.$kind" "$dest"; echo "added    .claude/harness.$kind (TEMPLATE — fill it)"
    note "Fill .claude/harness.$kind (placeholders __LIKE_THIS__ remain)."
  else echo "kept     .claude/harness.$kind"; fi
done

# Locations come from the conf (defaults if it is still a template).
get() {  # <var> <default>: read by sourcing, so quotes and comments behave as bash does
  local v=""
  [ -f "$ROOT/.claude/harness.conf" ] && v=$(set +u; . "$ROOT/.claude/harness.conf" >/dev/null 2>&1; eval "printf '%s' \"\${$1:-}\"")
  case "$v" in ''|__*) echo "$2" ;; *) echo "$v" ;; esac
}
DOCS=$(get DOCS_DIR docs); REQ=$(get REQUIREMENTS_DIR "$DOCS/requirements")
DEC=$(get DECISIONS_FILE "$DOCS/deferred-decisions.md"); QS=$(get QUESTIONS_FILE "$DOCS/open-questions.md")
CASES=$(get CASES_DIR "")

echo "== scripts"
place "$T/repo/scripts/gate.sh" "$ROOT/scripts/gate.sh"; [ $DRY = 1 ] || chmod +x "$ROOT/scripts/gate.sh" 2>/dev/null || true
note "Fill scripts/gate.sh (__PLACEHOLDERS__ per step) or point GATE_CMD at the command CI already runs."
for s in feature-start.sh feature-end.sh bootstrap.sh; do
  place "$T/workspace/scripts/$s" "$ROOT/scripts/$s"; [ $DRY = 1 ] || chmod +x "$ROOT/scripts/$s"
done

echo "== instructions"
existing=$(cd "$ROOT" && ls -d AGENTS.md .cursorrules .cursor/rules .github/copilot-instructions.md .windsurfrules 2>/dev/null || true)
if [ -f "$ROOT/CLAUDE.md" ]; then
  do_ cp "$T/workspace/CLAUDE.md.tmpl" "$ROOT/CLAUDE.md.harness-new"
  echo "exists   CLAUDE.md (template saved as CLAUDE.md.harness-new)"
  note "Merge CLAUDE.md.harness-new into CLAUDE.md: keep every existing rule; contradictions go to the open questions."
else
  do_ cp "$T/workspace/CLAUDE.md.tmpl" "$ROOT/CLAUDE.md"; echo "added    CLAUDE.md (TEMPLATE — fill the __PLACEHOLDERS__)"
  note "Fill CLAUDE.md from the interview (product, units, invariants, local environment)."
fi
[ -n "$existing" ] && note "Other agent instruction files exist ($(echo $existing)). Read them; merge or import (@AGENTS.md) rather than duplicate."
place "$T/repo/.claude/rules/_template.md" "$ROOT/.claude/rules/_template.md"

echo "== docs"
place "$T/workspace/docs/feature-workflow.md" "$ROOT/$DOCS/feature-workflow.md"
place "$T/workspace/docs/open-questions.md" "$ROOT/$QS"
place "$T/workspace/docs/deferred-decisions.md" "$ROOT/$DEC"
place "$T/workspace/docs/defects.csv" "$ROOT/$DOCS/defects.csv"
place "$T/workspace/docs/README.requirements.md" "$ROOT/$REQ/README.md"
[ -d "$ROOT/$REQ" ] || do_ mkdir -p "$ROOT/$REQ/sources"   # new project only; never move existing sources

if [ -n "$CASES" ]; then
  echo "== cases"
  place "$T/e2e/cases/README.md" "$ROOT/$CASES/README.md"
  place "$T/e2e/cases/screens/example.md" "$ROOT/$CASES/screens/example.md"
  place "$T/e2e/tools/cases-check.mjs" "$ROOT/$(dirname "$CASES")/tools/cases-check.mjs"
  note "Wire the cases check into the gate: (cd $(dirname "$CASES") && CASES_DIR=$(basename "$CASES") TESTS_DIR=<tests> node tools/cases-check.mjs)"
fi

note "Memory lives outside the repo; seed it from templates/memory/ (one note per trap, MEMORY.md index)."

echo
[ $DRY = 1 ] || bash "$SKILL/scripts/audit.sh" "$ROOT" || true
echo
echo "== to do by hand"
for n in "${NOTES[@]}"; do echo "  - $n"; done
