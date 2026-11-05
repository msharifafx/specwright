#!/usr/bin/env bash
# Clone the two application repos into this workspace and make it usable.
#
#   ./scripts/bootstrap.sh
#
# Run once after cloning the workspace repo. Idempotent — safe to re-run to pick
# up new dependencies or a repo you skipped.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Set these once, when the remotes exist. Override per-machine with
# APP_GIT_BASE=git@github.com:myorg ./scripts/bootstrap.sh
GIT_BASE="${APP_GIT_BASE:-REPLACE_ME}"

if [ "$GIT_BASE" = "REPLACE_ME" ]; then
  cat <<'EOF'
ERROR: no git remote configured.

The two application repos have no remotes yet. Either:

  1. Set the org once in this script (GIT_BASE), or
  2. Pass it per-run:
       APP_GIT_BASE=git@github.com:myorg ./scripts/bootstrap.sh

If you already have both repos cloned here, you do not need this script —
run the per-repo installs instead:

  (cd server-app && pnpm install)
  (cd web-app    && pnpm install)
EOF
  exit 1
fi

command -v pnpm >/dev/null || {
  echo "ERROR: pnpm not found. Install it: npm i -g pnpm"
  exit 1
}

for repo in server-app web-app; do
  echo "--- $repo ---"
  if [ -d "${ROOT}/${repo}/.git" ]; then
    echo "    already cloned, pulling"
    git -C "${ROOT}/${repo}" pull --ff-only || echo "    (pull skipped)"
  else
    git clone "${GIT_BASE}/${repo}.git" "${ROOT}/${repo}"
  fi
  # Without this the lint hook reports "NOT linted" on every edit and
  # `pnpm gate` fails. See CLAUDE.md.
  (cd "${ROOT}/${repo}" && pnpm install --frozen-lockfile)
  echo "    deps installed"
done

cat <<EOF

Workspace ready.

  cd ${ROOT} && claude          # sessions start HERE — features span both repos

Local backend stack:
  cd ${ROOT}/server-app && pnpm local:up && pnpm local:verify

Start a cross-repo feature:
  ./scripts/feature-start.sh <name>
EOF
