#!/usr/bin/env bash
# Start a cross-repo feature.
#
#   ./scripts/feature-start.sh orders-bulk-export
#
# A feature spans frontend and backend, but they are two separate git repos, so
# a feature needs a worktree in EACH. This creates both under one directory that
# mirrors the workspace layout, so you open Claude at that directory and
# everything behaves exactly as it does here.
#
#   ../app-feat-orders-bulk-export/
#     CLAUDE.md                  (copied — workspace rules)
#     .claude/                   (copied — the lint hook)
#     server-app/     (worktree, branch feat/orders-bulk-export)
#     web-app/        (worktree, same branch name)

set -euo pipefail

FEAT="${1:?usage: feature-start.sh <feature-name>}"
BRANCH="feat/${FEAT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/../app-feat-${FEAT}"

[ -e "$DEST" ] && { echo "ERROR: $DEST already exists."; exit 1; }
mkdir -p "$DEST"

for repo in server-app web-app; do
  echo "--- $repo ---"
  git -C "${ROOT}/${repo}" worktree add "${DEST}/${repo}" -b "$BRANCH"
  # Step zero. A fresh worktree has no node_modules, so without this the lint
  # hook reports "NOT linted" on every edit and `pnpm gate` fails. pnpm's
  # content-addressed store makes it about a second.
  (cd "${DEST}/${repo}" && pnpm install --frozen-lockfile >/dev/null)

  # `.env` is gitignored, so a worktree starts without one and every script that
  # calls loadEnv() dies on CENTRAL_DATABASE_URL before doing anything —
  # `pnpm migrate:tenants` and `pnpm seed` included. Copied rather than
  # symlinked so a feature can point at a different port or database without
  # editing the main checkout's file.
  if [ -f "${ROOT}/${repo}/.env" ]; then
    cp "${ROOT}/${repo}/.env" "${DEST}/${repo}/.env"
    echo "    worktree ready, deps installed, .env copied"
  else
    echo "    worktree ready, deps installed"
    echo "    NOTE: no ${repo}/.env in the main checkout — copy .env.example and fill it in."
  fi
done

# The workspace CLAUDE.md and the lint hook are not in either repo, so copy
# them in — otherwise a session opened at $DEST gets neither.
cp "${ROOT}/CLAUDE.md" "${DEST}/CLAUDE.md"
cp -r "${ROOT}/.claude" "${DEST}/.claude"

cat <<EOF

Feature worktrees ready: ${DEST}

  cd ${DEST} && claude

Both repos are on ${BRANCH}. Backend services still run from the MAIN checkout
(${ROOT}/server-app) — one local stack is shared across features:

  cd ${ROOT}/server-app && pnpm local:up && pnpm local:verify

When finished (from ${ROOT}):
  git -C server-app worktree remove ${DEST}/server-app
  git -C web-app    worktree remove ${DEST}/web-app
  rm -rf ${DEST}
EOF
