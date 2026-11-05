#!/usr/bin/env bash
# The PR gate. CI runs EXACTLY this script, so the local result and the CI
# result cannot diverge — a gate that exists only in CI is a gate developers
# meet by being blocked.
#
# Opinionated order: cheapest first, so a lint slip fails in seconds.
# Each step is a placeholder command; install.sh fills them from the
# interview. Delete a step only with a line in docs/deferred-decisions.md
# saying why — a silently missing step looks exactly like a passing one.
set -euo pipefail

step() { echo; echo "--- $1 ---"; }

step 'lint'
__LINT_ALL_CMD__

step 'typecheck'
__TYPECHECK_CMD__

step 'unit tests'
__UNIT_TEST_CMD__

step 'contract current?'
# The API emits its contract (OpenAPI, GraphQL schema, protobuf); consumers
# generate clients from it. Regenerate and fail if the committed copy differs.
# NOTE: this is a `git diff`, so regenerating is not enough — commit it.
__CONTRACT_CHECK_CMD__

step 'migration required?'
# A schema change without a migration is drift that ships.
__MIGRATION_CHECK_CMD__

step 'budget'
# Frontend: entry bundle and per-route chunk size. Backend: none by default.
__BUDGET_CMD__

step 'vulnerability scan'
# Dependencies and committed secrets, HIGH/CRITICAL WITH A FIX AVAILABLE only.
# Unfixable findings would make a gate nobody can clear, and a gate nobody can
# clear is a gate somebody switches off. Unfixed ones stay visible in a report.
__SCAN_CMD__

echo
echo 'gate passed.'
echo 'NOT covered here (run when the feature needs them): database-backed checks,'
echo 'load test, leak probe, end-to-end suite. See docs/feature-workflow.md.'
