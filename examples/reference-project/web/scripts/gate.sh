#!/usr/bin/env bash
# The PR gate. buildspec.yml runs exactly this, so `pnpm gate` locally and the
# CodeBuild PR check cannot diverge.
set -euo pipefail

echo '--- lint ---'
pnpm lint

echo '--- typecheck ---'
if compgen -G 'src/**/*.ts*' >/dev/null; then pnpm typecheck; else echo 'no sources yet, skipping'; fi

echo '--- unit tests ---'
pnpm test:unit

echo '--- generated client current? ---'
if [ -f openapi.json ]; then
  pnpm api:generate
  git diff --exit-code src/api/generated \
    || { echo 'ERROR: generated client is stale. Commit the regenerated output.'; exit 1; }
else
  echo 'no spec yet, skipping'
fi

echo '--- build + bundle budget ---'
if [ -f vite.config.ts ]; then
  pnpm build >/dev/null

  # Entry bundle: what stands between a signed-in user and their first screen.
  entry=$(find dist/assets -name 'index-*.js' -exec gzip -c {} \; | wc -c)
  echo "entry bundle: ${entry} bytes gzipped (budget 256000)"
  [ "$entry" -le 256000 ] || { echo 'ERROR: entry bundle over budget, see docs/performance.md'; exit 1; }

  # Per-route chunks. A route that grows past this has usually pulled a heavy
  # dependency into the graph — lazy-load it at the point of use instead.
  fail=0
  for f in dist/assets/*.js; do
    case "$f" in */index-*.js) continue ;; esac
    sz=$(gzip -c "$f" | wc -c)
    name=$(basename "$f")
    if [ "$sz" -gt 153600 ]; then
      echo "ERROR: route chunk ${name} is ${sz} bytes gzipped (budget 153600)"
      fail=1
    else
      echo "  route chunk ${name}: ${sz} bytes"
    fi
  done
  [ "$fail" -eq 0 ] || { echo 'See docs/performance.md'; exit 1; }
else
  echo 'no app yet, skipping'
fi

echo '--- vulnerability scan ---'
# Dependencies and hardcoded secrets — HIGH/CRITICAL that has a fix available. `pnpm scan:report` is the unfiltered view, dev dependencies
# included. The binary and the ~1.3GB database live in a shared machine-wide
# cache, so a new worktree costs nothing; a brand new MACHINE pays a ~110MB
# download on its first gate.
bash scripts/scan.sh

echo
echo 'gate passed.'
echo
echo 'The scan reads the LOCKFILE, not the source — a vulnerable dependency or a'
echo 'committed credential, never an XSS in a component or a query key missing'
echo 'its tenant id. Those stay with review and the ESLint rules.'
