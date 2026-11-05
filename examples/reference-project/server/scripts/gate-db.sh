#!/usr/bin/env bash
# Database-backed gates. Needs the local stack: pnpm local:up
set -euo pipefail

: "${DATABASE_URL:=postgres://postgres:postgres@localhost:55432/app_tenant_acme}"
export DATABASE_URL

if ! compgen -G 'src/db/*/schema/*.ts' >/dev/null; then
  echo 'no schema yet — nothing to check'
  exit 0
fi

echo '--- index drift ---'
bash scripts/ci/check-index-drift.sh
