#!/usr/bin/env node
// Builds the fixture: a pnpm + uv monorepo with planted contradictions.
//   node build-fixture.mjs <dir>
// Planted: BRD v1.1 vs v1.2 (GSTIN), BRD vs prototype (code editable vs
// locked), invariant breach (per-merchant isolation vs a cross-merchant
// report), hard delete of audited data, CLAUDE.md vs AGENTS.md (raw SQL vs
// SQLAlchemy), README vs CI (npm test vs pnpm/uv), environment branches vs
// artifact promotion, broken CI configs. Cross-platform: Node + git only.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const F = resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('usage: node build-fixture.mjs <dir>'); process.exit(1); }
const write = (p, s) => { mkdirSync(dirname(join(F, p)), { recursive: true }); writeFileSync(join(F, p), s); };
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (...a) => { const r = spawnSync('git', a, { cwd: F, env, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };

mkdirSync(F, { recursive: true });
git('init', '-q', '-b', 'main');
write('README.md', '# Shop\nRun tests with `npm test`. Deploy: merge to `staging` branch deploys staging, merge to `production` deploys prod.\n');
write('.github/workflows/ci.yml', `name: ci
on: [push]
jobs:
  web: {runs-on: ubuntu-latest, steps: [{run: "cd apps/web && pnpm install && pnpm vitest run && pnpm tsc --noEmit"}]}
  api: {runs-on: ubuntu-latest, steps: [{run: "cd services/api && uv sync && uv run pytest && uv run mypy ."}]}
  deploy: {runs-on: ubuntu-latest, if: "github.ref == 'refs/heads/main'", steps: [{run: "./promote.sh build-$GITHUB_SHA dev uat prod"}]}
`);
write('apps/web/package.json', '{"name":"web","scripts":{"lint":"eslint .","test":"vitest run"},"devDependencies":{"eslint":"9","typescript":"5","vitest":"2"}}\n');
write('apps/web/src/index.ts', 'export const x = 1;\n');
write('services/api/pyproject.toml', '[project]\nname="api"\n[tool.ruff]\nline-length=100\n');
write('services/api/app/main.py', 'x = 1\n');
write('pnpm-workspace.yaml', 'packages: ["apps/*"]\n');
write('docs/brd/BRD-v1.2-2026-08-01.md', `# Merchant Onboarding BRD v1.2
4.1 A merchant record has: Merchant Code (mandatory, unique), Name, GSTIN (optional), Status.
4.2 The Merchant Code is editable by the maker after checker approval.
4.3 Rejected merchants are deleted permanently after 30 days.
5.1 Each merchant sees only their own orders. The Orders report lists all orders across merchants with their totals.
`);
write('docs/brd/BRD-v1.1-2026-07-10.md', '# Merchant Onboarding BRD v1.1\n4.1 A merchant record has: Merchant Code (mandatory, unique), Name, GSTIN (mandatory), Status.\n');
write('docs/prototype.html', `<form id="merchant-edit"><label>Merchant Code *</label><input name="code" disabled title="locked after approval">
<label>GSTIN *</label><input name="gstin" required><label>Status</label><select name="status"><option>Active</option><option>Inactive</option></select></form>
`);
write('CLAUDE.md', '# Shop\n- Always run `npm test` before finishing.\n- Never use an ORM; raw SQL only.\n');
write('.claude/settings.json', '{"permissions":{"allow":["Bash(pnpm *)"]}}\n');
write('AGENTS.md', '- Use SQLAlchemy for all database access.\n');
git('add', '-A');
git('commit', '-qm', 'init');
git('branch', 'staging');
git('branch', 'production');
console.log(`fixture ready: ${F}`);
