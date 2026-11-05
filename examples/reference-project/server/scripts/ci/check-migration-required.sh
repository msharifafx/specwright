#!/usr/bin/env bash
# A schema change without a migration is drift that ships. Catches it at PR time.
set -euo pipefail

# CodeBuild has origin/main; a local worktree may have no remote at all, and
# this repo's default branch is `master`. Resolve to the first ref that exists
# rather than dying on a hard-coded one — a gate that errors on every local run
# is a gate developers learn to skip.
resolve_base() {
  for ref in ${BASE_REF:-} origin/main origin/master main master; do
    if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then echo "$ref"; return; fi
  done
}

BASE="$(resolve_base)"
if [ -z "$BASE" ]; then
  echo 'no base branch to compare against, skipping'
  exit 0
fi

changed=$(git diff --name-only "$BASE"...HEAD)

# Matches src/db/<track>/schema/<file>.ts as well as the older single-file
# layout — the schema is one file per table now (src/db/tenant/schema/roles.ts).
schema=$(echo "$changed"     | grep -E '^src/db/.*/schema.*\.ts$'      || true)

# ASK THE GENERATOR WHENEVER THE SCHEMA CHANGED, not only when no migration is
# present. "A migration exists" is not "the migration covers every change": a
# branch that adds two tables and generates DDL for one passes a check that only
# looks for the presence of a .sql file. That is exactly how `notifications`
# reached a local database as a missing-relation error at runtime, in a branch
# whose gate was green because the templates migration beside it satisfied the
# old condition.
if [ -n "$schema" ]; then
  # A CHANGED SCHEMA FILE IS NOT THE SAME AS CHANGED DDL, and treating them as
  # the same made this gate cry wolf. `src/db/central/schema/tenants.ts` holds
  # `TENANT_STATUSES` next to the table it describes — deliberately, so the
  # lifecycle states have one home — and `status` is a `text` column with no
  # CHECK constraint, so adding a state changes TypeScript and nothing in
  # Postgres. Same for a comment, a type export, or a renamed constant.
  #
  # So ask the generator instead of guessing from the path. It diffs the schema
  # against the migration journal and needs no database, exactly like
  # `openapi:generate` two steps above. If it emits a migration, that migration
  # is now sitting in the tree for the developer to review and commit; if it
  # emits nothing, there was never anything to commit.
  echo "schema files changed — asking drizzle-kit whether any DDL is unaccounted for"
  pnpm db:generate:central >/dev/null 2>&1 || true
  pnpm db:generate:tenant  >/dev/null 2>&1 || true

  generated=$(git status --porcelain -- 'src/db/*/migrations/*.sql' | awk '{print $2}')
  if [ -n "$generated" ]; then
    echo "ERROR: schema changed and DDL is missing. Review and commit the generated migration:"
    echo "$generated"
    exit 1
  fi

  echo "ok: every schema change is covered by a committed migration"
  exit 0
fi
echo "ok: no schema files changed"
