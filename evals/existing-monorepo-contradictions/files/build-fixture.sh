#!/usr/bin/env bash
# Builds the fixture: a pnpm + uv monorepo with planted contradictions.
#   build-fixture.sh <dir>
# Planted: BRD v1.1 vs v1.2 (GSTIN), BRD vs prototype (code editable vs locked),
# invariant breach (per-merchant isolation vs cross-merchant report), hard delete
# of audited data, CLAUDE.md vs AGENTS.md (raw SQL vs SQLAlchemy), README vs CI
# (npm test vs pnpm/uv), env branches vs artifact promotion, broken CI configs.
set -euo pipefail
F="${1:?usage: build-fixture.sh <dir>}"; mkdir -p "$F"/{apps/web/src,services/api/app,docs/brd,.github/workflows,.claude}; cd "$F"; git init -q -b main
printf '# Shop\nRun tests with `npm test`. Deploy: merge to `staging` branch deploys staging, merge to `production` deploys prod.\n' > README.md
cat > .github/workflows/ci.yml <<'Y'
name: ci
on: [push]
jobs:
  web: {runs-on: ubuntu-latest, steps: [{run: "cd apps/web && pnpm install && pnpm vitest run && pnpm tsc --noEmit"}]}
  api: {runs-on: ubuntu-latest, steps: [{run: "cd services/api && uv sync && uv run pytest && uv run mypy ."}]}
  deploy: {runs-on: ubuntu-latest, if: "github.ref == 'refs/heads/main'", steps: [{run: "./promote.sh build-$GITHUB_SHA dev uat prod"}]}
Y
echo '{"name":"web","scripts":{"lint":"eslint .","test":"vitest run"},"devDependencies":{"eslint":"9","typescript":"5","vitest":"2"}}' > apps/web/package.json
echo 'export const x = 1;' > apps/web/src/index.ts
printf '[project]\nname="api"\n[tool.ruff]\nline-length=100\n' > services/api/pyproject.toml; echo 'x = 1' > services/api/app/main.py
echo 'packages: ["apps/*"]' > pnpm-workspace.yaml
printf '# Merchant Onboarding BRD v1.2\n4.1 A merchant record has: Merchant Code (mandatory, unique), Name, GSTIN (optional), Status.\n4.2 The Merchant Code is editable by the maker after checker approval.\n4.3 Rejected merchants are deleted permanently after 30 days.\n5.1 Each merchant sees only their own orders. The Orders report lists all orders across merchants with their totals.\n' > docs/brd/BRD-v1.2-2026-08-01.md
printf '# Merchant Onboarding BRD v1.1\n4.1 A merchant record has: Merchant Code (mandatory, unique), Name, GSTIN (mandatory), Status.\n' > docs/brd/BRD-v1.1-2026-07-10.md
printf '<form id="merchant-edit"><label>Merchant Code *</label><input name="code" disabled title="locked after approval">\n<label>GSTIN *</label><input name="gstin" required><label>Status</label><select name="status"><option>Active</option><option>Inactive</option></select></form>\n' > docs/prototype.html
printf '# Shop\n- Always run `npm test` before finishing.\n- Never use an ORM; raw SQL only.\n' > CLAUDE.md
echo '{"permissions":{"allow":["Bash(pnpm *)"]}}' > .claude/settings.json
echo '- Use SQLAlchemy for all database access.' > AGENTS.md
git add -A; git -c user.email=t@t -c user.name=t commit -qm init; git branch staging; git branch production
