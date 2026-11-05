#!/usr/bin/env bash
# Proves the live database and the model describe the same indexes.
#
# Two independent checks, because each misses what the other catches:
#   1. drizzle-kit generate produces nothing  -> schema matches migrations
#   2. pg_indexes names == model index names  -> catches a hand-written
#      migration that added an index the schema never declared
set -euo pipefail

DB_URL="${DATABASE_URL:?DATABASE_URL required}"
MIGRATIONS=src/db/tenant/migrations

pnpm drizzle-kit migrate --config drizzle.tenant.config.ts

before=$(find "$MIGRATIONS" -name '*.sql' | wc -l)
pnpm drizzle-kit generate --config drizzle.tenant.config.ts
after=$(find "$MIGRATIONS" -name '*.sql' | wc -l)

if [ "$before" -ne "$after" ]; then
  echo "ERROR: drizzle-kit generated an uncommitted migration — model and migrations disagree."
  git --no-pager diff --stat
  exit 1
fi

# Constraint-backed indexes are excluded because they are not DECLARED as
# indexes in the schema — Postgres creates them for the constraint:
#   _pkey   single-column primary key
#   _pk     composite primary key, which is how drizzle names it
#           (primaryKey({ columns }) on user_banks / user_products)
#   _unique a unique constraint
# Everything else must have a matching index() or uniqueIndex() declaration.
psql "$DB_URL" -Atc \
  "select indexname from pg_indexes where schemaname='public' order by 1" \
  | grep -vE '(_pkey|_pk|_unique)$' | sort -u > /tmp/db_indexes.txt

grep -rhoE "(unique)?[Ii]ndex\('[a-z0-9_]+'" src/db/tenant/schema/*.ts \
  | grep -oE "'[a-z0-9_]+'" | tr -d "'" | sort -u > /tmp/model_indexes.txt

if ! diff -u /tmp/model_indexes.txt /tmp/db_indexes.txt; then
  echo "ERROR: index names in the database and the model disagree."
  echo "Note: column-level .unique() is banned for this reason — see docs/database.md."
  exit 1
fi
echo "ok: no index drift"
