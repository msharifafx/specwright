#!/usr/bin/env bash
# Memory leak probe. Backend only.
#
# Long-lived worker processes holding per-tenant state leak in specific,
# predictable ways in this architecture:
#
#   1. Pools evicted from the registry LRU without .end() — the socket and its
#      Postgres backend stay alive, so the connection budget silently shrinks.
#   2. Valkey client listeners added per request or per job, never removed.
#   3. SQS long-poll closures capturing a tenant context that outlives the
#      message.
#
# Passes if RSS growth is under the budget AND heap object counts for pools,
# sockets, and listeners are flat between the two snapshots. Steady RSS with a
# growing socket count is still a leak — it just has not hurt yet.
#
# This is a NIGHTLY pipeline job, not a PR gate: it is too slow and too noisy at
# PR latency. Run it locally when a feature adds anything long-lived.
#
# THE LOAD IS HTTP; THE DEFAULT TARGET IS THE WORKER. Those are two processes,
# and this script only starts the one it measures — so probing the worker needs
# the API already running for k6 to drive, and the worker is then exercised only
# by whatever jobs that traffic enqueues. To measure the API instead:
#
#   pnpm build && TARGET=dist/src/main.js HEALTH_URL=http://localhost:3000/api/health \
#     pnpm leakcheck                                        # nothing else on :3000
#
# What load through `/api/users` does NOT reach: the integration data-key cache
# and the per-tenant SMTP transport LRU. Both are keyed per tenant against caps
# of 20-odd, and the local stack seeds six workspaces of which two can log in, so
# neither can be made to evict from here at any duration. Their eviction paths
# are asserted in test/unit/tenant-transport.spec.ts instead; this probe bounds
# general request-path growth and nothing more. Say which of the two you ran.

set -uo pipefail

DURATION_MIN="${DURATION_MIN:-10}"
RSS_BUDGET_MB="${RSS_BUDGET_MB:-50}"
# `rootDir: "."` in tsconfig.json, so the build emits into dist/src/, not dist/.
# This read dist/worker.js, a path the build has never produced, and the guard
# below exited 0 — so `pnpm leakcheck` reported success without ever starting a
# process to measure.
TARGET="${TARGET:-dist/src/worker.js}"
OUT="${OUT:-.leakcheck}"

if [ ! -f "$TARGET" ]; then
  echo "leak-probe: $TARGET not found — run pnpm build first."
  # NOT exit 0. A probe that cannot measure has not passed, and this branch is
  # exactly why the check stayed green for as long as the path was wrong.
  exit 1
fi

mkdir -p "$OUT"

echo "Starting worker with heap snapshot signal enabled..."
node --expose-gc --heapsnapshot-signal=SIGUSR2 "$TARGET" &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT

sleep 30 # let startup allocations settle; measuring before this is noise

# --heapsnapshot-signal writes into the process CWD, which is the repository
# root, and each file is ~65MB. They were not gitignored, so a `git add -A`
# after a probe run would have staged a few hundred megabytes of heap dump.
# Move them where this script has always claimed they were.
collect_snapshots() {
  mv -f ./*.heapsnapshot "$OUT/" 2>/dev/null || true
}

# Confirm the target is still answering after each snapshot, before trusting a
# measurement taken from it.
#
# This exists because of a real bug, now fixed in src/main.ts: SIGUSR2 is both
# Node's heap-snapshot signal and a member of Nest's default ShutdownSignal set,
# so asking the API for a snapshot shut the API down. Two runs of this probe were
# spent blaming the snapshot for "connection reset by peer" before that landed.
# The gate stays, because a probe that measures a dead process is worse than one
# that fails.
#
# HEALTH_URL is empty when the target is the worker, which listens on nothing —
# that case skips the wait.
HEALTH_URL="${HEALTH_URL:-}"
wait_ready() {
  [ -n "$HEALTH_URL" ] || return 0
  for _ in $(seq 1 60); do
    # ANY HTTP response counts. The question is whether the process answers at
    # all, not whether health is green — and `-f` against a wrong path turns a
    # 404 into two minutes of polling and an exit 1, which is how one run of
    # this spent its entire budget on /health instead of /api/health.
    curl -sS -o /dev/null --max-time 5 "$HEALTH_URL" && return 0
    sleep 2
  done
  echo "leak-probe: $HEALTH_URL never answered"
  exit 1
}

# Baseline AFTER a snapshot, not before. Writing a heap snapshot forces a full
# GC in V8, so taking it first is what makes both ends of the measurement
# comparable — otherwise the baseline includes uncollected startup garbage and
# every run reports a "leak" of whatever the first collection would have freed.
kill -USR2 "$PID"; sleep 5
collect_snapshots
wait_ready
rss_start=$(ps -o rss= -p "$PID" | tr -d ' ')
echo "baseline RSS: $((rss_start / 1024))MB"

if ! command -v k6 >/dev/null; then
  # Idling measures nothing. A probe that cannot drive load has not passed.
  echo "leak-probe: k6 not installed — cannot drive load, and an idle process"
  echo "proves nothing. Install k6 and re-run."
  exit 1
fi

# NOT `k6 run --duration Nm`. `--duration` puts k6 into single-scenario mode and
# looks for a `default` export, which multi-tenant.js does not have because it
# runs two named scenarios — so that invocation failed instantly, and with
# output redirected to /dev/null the probe measured an IDLE process for the
# whole of its "load" phase and reported the number as a result.
#
# The script's own scenarios run ~2 minutes, so repeat it until the requested
# duration has elapsed. Repetition is a better probe anyway: each run opens and
# closes a fresh set of connections, which is precisely what leaks.
echo "Driving load for ${DURATION_MIN} minutes..."
deadline=$(( SECONDS + DURATION_MIN * 60 ))
runs=0
while [ "$SECONDS" -lt "$deadline" ]; do
  # --no-thresholds: this is a MEMORY probe. A p95 regression is the load test's
  # finding to report, and failing here would hide the RSS number behind it.
  if ! k6 run --quiet --no-thresholds loadtest/multi-tenant.js >"$OUT/k6-run-$runs.log" 2>&1; then
    echo "leak-probe: k6 failed — see $OUT/k6-run-$runs.log"
    exit 1
  fi
  runs=$(( runs + 1 ))
done
echo "completed ${runs} load run(s)"

# A snapshot forces a full GC, so what RSS reflects afterwards is genuinely
# reachable rather than merely uncollected. The previous version sent SIGUSR1
# for this, which does not collect anything — it starts the V8 inspector.
kill -USR2 "$PID"; sleep 10
collect_snapshots
wait_ready
rss_end=$(ps -o rss= -p "$PID" | tr -d ' ')

growth_mb=$(( (rss_end - rss_start) / 1024 ))
echo
echo "RSS: $((rss_start / 1024))MB -> $((rss_end / 1024))MB  (growth ${growth_mb}MB, budget ${RSS_BUDGET_MB}MB)"
echo "Heap snapshots written to $OUT — diff them in Chrome DevTools."
echo "Compare retained counts for: Pool, Socket, Client, and listener closures."

if [ "$growth_mb" -gt "$RSS_BUDGET_MB" ]; then
  echo "FAIL: RSS grew ${growth_mb}MB over ${DURATION_MIN}min (budget ${RSS_BUDGET_MB}MB)"
  exit 1
fi

echo "PASS: RSS growth within budget."
echo "NOTE: RSS is necessary, not sufficient. Check the snapshot object counts too."
