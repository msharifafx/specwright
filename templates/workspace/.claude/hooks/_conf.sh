#!/usr/bin/env bash
# Shared by every hook and script: locate the harness root, load settings and
# the unit table.
#
# .claude/hooks/<x>.sh → two levels up is the directory this copy belongs to.
# A copy sits wherever a session may start (workspace root, each separate
# repo, each feature worktree) because .claude/settings.json is read from the
# SESSION's project root only.
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
[ -f "$HARNESS_ROOT/.claude/harness.conf" ] && . "$HARNESS_ROOT/.claude/harness.conf"
UNITS_FILE="$HARNESS_ROOT/.claude/harness.units"
# An unfilled template placeholder (__LIKE_THIS__) counts as unset.
for _v in PRODUCT DOCS_DIR REQUIREMENTS_DIR CASES_DIR DECISIONS_FILE QUESTIONS_FILE WORKTREE_PREFIX GATE_CMD GIT_BASE; do
  case "${!_v:-}" in __*) printf -v "$_v" '%s' "" ;; esac
done

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; echo "${s%"${s##*[![:space:]]}"}"; }

# Prints one line per unit: path<TAB>exts<TAB>lint<TAB>typecheck<TAB>install,
# path made absolute, a missing key printed as "-". Parses the INI-style
# blocks in harness.units.
units() {
  [ -f "$UNITS_FILE" ] || return 0
  local line k v p="" e="-" l="-" t="-" i="-" open=0
  emit() {
    [ "$open" = 1 ] && [ -n "$p" ] || return 0
    local abs; [ "$p" = "." ] && abs="$HARNESS_ROOT" || abs="$HARNESS_ROOT/$p"
    printf '%s\t%s\t%s\t%s\t%s\n' "$abs" "$e" "$l" "$t" "$i"
  }
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(trim "$line")
    case "$line" in
      ''|'#'*) continue ;;
      '['*']') emit; open=1; p=""; e="-"; l="-"; t="-"; i="-" ;;
      *=*)
        k=$(trim "${line%%=*}"); v=$(trim "${line#*=}")
        case "$k" in path) p="$v" ;; exts) e="$v" ;; lint) l="$v" ;; typecheck) t="$v" ;; install) i="$v" ;; esac ;;
    esac
  done <"$UNITS_FILE"
  emit
}

# The unit owning a file = the unit whose path is the LONGEST prefix of it,
# so services/api wins over "." for services/api/x.py.
unit_for() {
  local f="$1" best="" bestlen=0 row p
  while IFS= read -r row; do
    p="${row%%$'\t'*}"
    case "$f" in "$p"/*|"$p")
      if [ "${#p}" -gt "$bestlen" ]; then best="$row"; bestlen=${#p}; fi ;;
    esac
  done < <(units)
  echo "$best"
}

# Distinct git working trees the units live in. One for a single repo or a
# monorepo; several when units are separate repos.
git_roots() {
  local row p
  while IFS= read -r row; do
    p="${row%%$'\t'*}"
    git -C "$p" rev-parse --show-toplevel 2>/dev/null
  done < <(units) | sort -u
}
