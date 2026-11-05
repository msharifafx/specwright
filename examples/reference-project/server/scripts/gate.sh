#!/usr/bin/env bash
# The PR gate. buildspec.yml runs exactly this, so `pnpm gate` locally and the
# CodeBuild PR check cannot diverge — a gate that exists only in CI is a gate
# developers meet by being blocked.
#
# Gates needing a live database are NOT here; they need the local stack and
# would make the common path slow. Run those with `pnpm gate:db`.
set -euo pipefail

echo '--- lint ---'
pnpm lint

echo '--- typecheck ---'
if compgen -G 'src/**/*.ts' >/dev/null; then pnpm typecheck; else echo 'no sources yet, skipping'; fi

echo '--- unit tests ---'
pnpm test:unit

echo '--- openapi.json current? ---'
# The contract the web repo generates its client from. Emitting it needs no
# database and no environment (see scripts/openapi-bootstrap.ts), which is why
# this belongs in the fast gate rather than in gate:db.
pnpm openapi:generate >/dev/null
git diff --exit-code openapi.json \
  || { echo 'ERROR: openapi.json is stale. Commit the regenerated spec.'; exit 1; }

echo '--- migration required? ---'
if compgen -G 'src/db/*/schema/*.ts' >/dev/null; then
  bash scripts/ci/check-migration-required.sh
else
  echo 'no schema yet, skipping'
fi

echo '--- vulnerability scan ---'
# Dependencies, hardcoded secrets, and the Dockerfile — HIGH/CRITICAL that has a
# fix available. `pnpm scan:report` is the unfiltered view, dev dependencies
# included. The binary and the ~1.3GB database live in a shared machine-wide
# cache, so a new worktree costs nothing; a brand new MACHINE pays a ~110MB
# download on its first gate.
bash scripts/scan.sh

echo
echo 'gate passed.'
echo 'NOT covered here: index drift (needs a database — run `pnpm gate:db` with the'
echo 'local stack up), multi-tenant load test (`pnpm loadtest`), leak probe'
echo '(`pnpm leakcheck`). See docs/feature-workflow.md.'
echo
echo 'The scan reads the LOCKFILE, not the source. It finds a vulnerable'
echo 'dependency and a committed credential; it cannot see a missing tenant'
echo 'scope, an unguarded route, or interpolated SQL. Those stay with review'
echo 'and the ESLint architectural rules.'
