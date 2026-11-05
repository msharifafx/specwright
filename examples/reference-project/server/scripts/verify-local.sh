#!/usr/bin/env bash
# Proves the local stack actually works. "docker compose ps" showing Up is not
# proof — every check here exercises a behaviour the codebase depends on.
#
# The PgBouncer check is the important one: it empirically validates the premise
# behind the entire PGBOUNCER_TXN_MODE lint family in eslint.config.mjs. If a
# session-level SET survives across transactions, transaction pooling is not
# actually in effect and those rules are guarding nothing.

set -uo pipefail

# Overridable, so ONE verify script serves both stacks: the shared one on its
# default ports, and the isolated e2e stack on the same ports +100. `pnpm
# e2e:verify` sets these. Hardcoding them would have meant a second copy of
# this file, and a second copy is how the two silently stop testing the same
# things.
PGB_PORT=${PGB_PORT:-56432}
PG_PORT=${PG_PORT:-55432}
VALKEY_PORT=${VALKEY_PORT:-56379}
SQS=${SQS:-http://localhost:59324}
S3=${S3:-http://localhost:59000}
# Which compose project the container-exec fallbacks address. Without this an
# e2e verify would exec into the SHARED stack's valkey and report it healthy.
COMPOSE=${COMPOSE:-docker compose}
export PGPASSWORD=postgres

# ElasticMQ and MinIO ignore credentials, but the AWS CLI refuses to SIGN a
# request without them and reports "Unable to locate credentials" — which reads
# as a broken stack. Dummies make this script self-contained rather than
# dependent on whichever profile the developer happens to have configured, and
# stop it from silently using a REAL one.
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-minioadmin}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-minioadmin}
export AWS_REGION=${AWS_REGION:-ap-south-1}
unset AWS_PROFILE AWS_SESSION_TOKEN
export AWS_EC2_METADATA_DISABLED=true

pass=0
fail=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

psql_pgb() { psql -h localhost -p "$PGB_PORT" -U postgres -d "$1" -Atc "$2" 2>&1; }

head '1. Postgres (direct)'
if [ "$(psql -h localhost -p $PG_PORT -U postgres -d postgres -Atc 'select 1' 2>&1)" = "1" ]; then
  ok 'accepts connections'
else
  bad 'cannot connect to postgres on 5432'
fi

dbs=$(psql -h localhost -p $PG_PORT -U postgres -d postgres -Atc \
  "select count(*) from pg_database where datname like 'app_%'" 2>&1)
if [ "$dbs" = "4" ]; then
  ok 'fixture databases present (app_central + 3 tenants)'
else
  bad "expected 4 app_* databases, found: $dbs"
fi

head '2. PgBouncer (transaction pooling)'
if [ "$(psql_pgb app_central 'select 1')" = "1" ]; then
  ok 'routes to app_central'
else
  bad "cannot connect through pgbouncer: $(psql_pgb app_central 'select 1')"
fi

if [ "$(psql_pgb app_tenant_acme 'select current_database()')" = "app_tenant_acme" ]; then
  ok 'wildcard database routing works (per-tenant databases reachable)'
else
  bad 'wildcard routing to tenant database failed'
fi

mode=$(psql -h localhost -p "$PGB_PORT" -U postgres -d pgbouncer -Atc 'show config' 2>/dev/null \
  | grep -E '^pool_mode' | cut -d'|' -f2)
if [ "$mode" = "transaction" ]; then
  ok 'pool_mode is transaction'
else
  bad "pool_mode is '$mode', expected 'transaction'"
fi

# THE check, and the reason this script exists.
#
# Two separate transactions on ONE client session. Under transaction pooling
# they land on different server backends, so a session-level SET in the first
# must NOT be visible in the second. Each -c is its own transaction; both share
# a single client connection, which is exactly the application's shape.
#
# Note: read the SHOW output, not the last line — the last line is "COMMIT".
# An earlier version of this check compared against "COMMIT" and therefore
# passed no matter what PgBouncer did.
leaked=$(psql -h localhost -p "$PGB_PORT" -U postgres -d app_central -At \
  -c "begin; set statement_timeout = '9s'; commit;" \
  -c "show statement_timeout" 2>&1 | grep -E '^[0-9]+(ms|s|min)?$' | tail -1)
if [ -n "$leaked" ] && [ "$leaked" != "9s" ]; then
  ok "session SET did not survive the transaction (statement_timeout='$leaked', not '9s') — the ban on SET is real"
elif [ "$leaked" = "9s" ]; then
  bad 'session-level SET leaked into the next transaction — pooling is NOT in transaction mode'
else
  bad "could not read statement_timeout back (got '$leaked')"
fi

# SET LOCAL is the sanctioned replacement; it must apply inside its transaction.
scoped=$(psql -h localhost -p "$PGB_PORT" -U postgres -d app_central -At \
  -c "begin; set local statement_timeout = '7s'; show statement_timeout; commit;" 2>&1 \
  | grep -E '^[0-9]+(ms|s|min)?$' | tail -1)
if [ "$scoped" = "7s" ]; then
  ok 'SET LOCAL applies inside its transaction — the documented alternative works'
else
  bad "SET LOCAL did not apply (saw '$scoped')"
fi

head '3. Valkey'
if [ "$(redis-cli -p $VALKEY_PORT ping 2>&1 || valkey-cli -p $VALKEY_PORT ping 2>&1)" = "PONG" ]; then
  ok 'responds to PING'
else
  # No local client binary is common; fall back to the container.
  if [ "$($COMPOSE exec -T valkey valkey-cli ping 2>&1 | tr -d '\r')" = "PONG" ]; then
    ok 'responds to PING (via container)'
  else
    bad 'valkey not responding'
  fi
fi

head '4. SQS (ElasticMQ)'
queues=$(aws --endpoint-url "$SQS" sqs list-queues --output text 2>&1)
for q in app-local-interactive app-local-bulk app-local-maintenance; do
  if echo "$queues" | grep -q "$q"; then
    ok "queue $q exists"
  else
    bad "queue $q missing"
  fi
done

# Probe on its OWN queue, not a job queue. A job queue may hold in-flight
# messages from a killed worker, and the receive would return nothing —
# reporting a broken stack when the stack is fine.
PROBE_Q=$(aws --endpoint-url "$SQS" sqs create-queue --queue-name app-local-verify-probe \
  --output text --query QueueUrl 2>&1)
QURL="$PROBE_Q"
if echo "$QURL" | grep -q 'app-local-verify-probe'; then
  aws --endpoint-url "$SQS" sqs purge-queue --queue-url "$QURL" >/dev/null 2>&1
  aws --endpoint-url "$SQS" sqs send-message --queue-url "$QURL" \
    --message-body '{"probe":true}' --message-group-id 'tenant-acme' >/dev/null 2>&1
  body=$(aws --endpoint-url "$SQS" sqs receive-message --queue-url "$QURL" \
    --wait-time-seconds 2 --output text --query 'Messages[0].Body' 2>&1)
  if echo "$body" | grep -q 'probe'; then
    ok 'message round-trips, MessageGroupId accepted'
    printf '  \033[33mNOTE\033[0m  MessageGroupId is accepted and IGNORED locally.\n'
    printf '        SQS fair-queue behaviour is server-side AWS. Tenant fairness\n'
    printf '        CANNOT be verified here — only against real SQS in staging.\n'
  else
    bad "message did not round-trip: $body"
  fi
else
  bad "could not resolve queue url: $QURL"
fi

head '5. S3 (MinIO)'
if curl -sf "$S3/minio/health/live" >/dev/null 2>&1; then
  ok 'responds to health check'
else
  bad 's3 not responding'
fi

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
