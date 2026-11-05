#!/usr/bin/env node
// Report which parts of Specwright a project has, what is missing, unfilled
// or out of date. Read-only. Run during discovery on an existing project, and
// again after installing.
//
//   node audit.mjs <project-root>
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_VERSION = readFileSync(join(SKILL, 'VERSION'), 'utf8').trim();
const ROOT = resolve(process.argv[2] || '.');
let have = 0, miss = 0, warn = 0;
const y = (m) => { console.log(`  [x] ${m}`); have++; };
const n = (m) => { console.log(`  [ ] ${m}`); miss++; };
const w = (m) => { console.log(`  [!] ${m}`); warn++; };
const f = (p) => existsSync(join(ROOT, p));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const git = (cwd, a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const onPath = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' }).status === 0;

function walk(dir, depth, out = []) {
  if (depth < 0 || !existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (['node_modules', 'vendor', 'target', 'dist', 'build', '.venv'].includes(e)) continue;
    const p = join(dir, e);
    if (e === '.git') { if (dir !== ROOT) out.push(p); continue; }  // note nested repos, never descend
    let s; try { s = statSync(p); } catch { continue; }
    out.push(p);
    if (s.isDirectory()) walk(p, depth - 1, out);
  }
  return out;
}

console.log(`Specwright audit: ${ROOT}\n\nLayout`);
const top = git(ROOT, ['rev-parse', '--show-toplevel']);
if (top && resolve(top) === ROOT) console.log('  project root is a git repo');
else if (top) w(`project root is INSIDE repo ${top} — usually the repo root should be the project root`);
else console.log('  project root is not a git repo (workspace of repos?)');
const entries = walk(ROOT, 3);
const nested = entries.filter((p) => /[\\/]\.git$/.test(p)).map((p) => relative(ROOT, dirname(p))).filter(Boolean);
if (nested.length) console.log(`  nested git repos: ${nested.join(' ')}`);
const mono = ['pnpm-workspace.yaml', 'nx.json', 'turbo.json', 'lerna.json', 'go.work', 'settings.gradle', 'settings.gradle.kts', '.gitmodules'].filter(f);
if (mono.length) console.log(`  workspace/monorepo files: ${mono.join(' ')}`);
const MAN = /^(package\.json|pyproject\.toml|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|.*\.csproj|Gemfile|composer\.json|pubspec\.yaml|Package\.swift)$/;
const mans = entries.filter((p) => MAN.test(p.split(/[\\/]/).pop())).map((p) => relative(ROOT, p).split('\\').join('/'));
console.log(`  manifests: ${mans.join(' ') || 'none'}`);

console.log('\nConfiguration');
let cfg = null;
if (f('.claude/specwright.ini')) {
  y('.claude/specwright.ini');
  const ph = [...new Set(read('.claude/specwright.ini').match(/__[A-Z0-9_]+__/g) || [])];
  if (ph.length) w(`specwright.ini has unfilled placeholders: ${ph.slice(0, 8).join(' ')}`);
  if (f('.claude/hooks/lib.mjs')) {
    const lib = await import(pathToFileURL(join(ROOT, '.claude', 'hooks', 'lib.mjs')).href);
    cfg = lib.loadConfig(ROOT);
    for (const p of cfg.problems) w(`specwright.ini ${p}`);
    const v = cfg.project.version;
    if (!v) w('no version in specwright.ini — installed by an old Specwright?');
    else if (v !== SKILL_VERSION) w(`hooks installed by Specwright ${v}; this skill is ${SKILL_VERSION} — re-run install.mjs to update them`);
    else y(`hooks match Specwright ${v}`);
    console.log(`  tier: ${cfg.project.tier || '(unset — standard)'}`);
    if (!cfg.units.length) n('no [unit ...] blocks');
    for (const u of cfg.units) {
      const r = relative(ROOT, u.dir) || '.';
      if (!existsSync(u.dir)) { w(`unit ${u.name}: ${r} does not exist`); continue; }
      for (const k of ['lint', 'typecheck']) if (!u[k]) w(`unit ${u.name}: no ${k} command`);
      for (const k of ['lint', 'typecheck', 'install']) {
        const bin = u[k]?.split(/\s+/)[0];
        if (bin && !bin.startsWith('.') && !['npx', 'pnpm', 'npm', 'yarn', 'bunx', 'uv', 'poetry'].includes(bin) && !onPath(bin)) w(`unit ${u.name}: ${k} uses "${bin}", not on PATH`);
      }
      console.log(`  unit ${u.name}: ${r}  [${u.exts.join(' ')}]`);
    }
    if (cfg.gate.filter((s) => s.cmd).length) y(`gate: ${cfg.gate.filter((s) => s.cmd).map((s) => s.name).join(' → ')}`);
    else n('[gate] steps');
  }
} else n('.claude/specwright.ini');

console.log('\nHooks');
for (const h of ['lib', 'lint', 'gate', 'turn-start', 'hotfix']) (f(`.claude/hooks/${h}.mjs`) ? y : n)(`hooks/${h}.mjs`);
if (f('.claude/settings.json')) {
  const s = read('.claude/settings.json');
  for (const h of ['lint', 'gate', 'turn-start', 'hotfix']) (s.includes(`.claude/hooks/${h}.mjs`) ? y : n)(`settings.json wires ${h}.mjs`);
} else n('.claude/settings.json');
(onPath('node') ? y : n)('node on PATH (the hooks run with it)');
(onPath('graphify') ? y : n)('graphify installed (required: `uv tool install graphifyy`, then `graphify install`)');
if (f('.claude/hotfix-chain')) console.log(`  hotfix chain ARMED: ${read('.claude/hotfix-chain').replace(/#.*$/gm, '').split(/\s+/).filter(Boolean).join(' → ')}`);
for (const r of nested) {
  const s = join(r, '.claude', 'settings.json');
  (f(s) && read(s).includes('lint.mjs') ? y : w)(`repo ${r} ${f(s) && read(s).includes('lint.mjs') ? 'has its own hook wiring' : 'has no hook wiring — sessions started inside it are unguarded (node scripts/bootstrap.mjs)'}`);
}

console.log('\nInstructions');
(f('CLAUDE.md') ? y : n)('CLAUDE.md');
if (f('CLAUDE.md')) {
  const c = read('CLAUDE.md');
  const ph = [...new Set(c.match(/__[A-Z0-9_]+__/g) || [])];
  if (ph.length) w(`CLAUDE.md has unfilled placeholders: ${ph.slice(0, 8).join(' ')}`);
  if (!/^#+ .*invariant/im.test(c)) w('CLAUDE.md has no Invariants section (coding-style "never" rules are not invariants)');
  const lessons = cfg?.project.lessons_dir || 'docs/lessons';
  if (!c.includes(`@${lessons}/INDEX.md`)) w(`CLAUDE.md does not import @${lessons}/INDEX.md — team lessons will not reach sessions`);
}
for (const o of ['AGENTS.md', '.cursorrules', '.cursor/rules', '.github/copilot-instructions.md', '.windsurfrules']) {
  if (f(o)) w(`other agent instructions: ${o} — compare with CLAUDE.md for contradictions FIRST, then merge or import`);
}
const rules = entries.filter((p) => /[\\/]\.claude[\\/]rules[\\/][^\\/]+\.md$/.test(p) && !p.endsWith('_template.md'));
(rules.length ? y : n)(`${rules.length} path-scoped rule file(s)`);
for (const p of entries.filter((p) => p.endsWith('.specwright-new'))) w(`unmerged template: ${relative(ROOT, p)}`);

console.log('\nWorkflow and records');
const P = cfg?.project || {};
const docs = P.docs_dir || 'docs';
const tierLite = P.tier === 'lite';
for (const s of ['gate.mjs', 'feature-start.mjs', 'feature-end.mjs']) (f(`scripts/${s}`) ? y : n)(`scripts/${s}`);
(f(P.questions_file || `${docs}/open-questions.md`) ? y : n)('open-questions register');
(f(`${P.lessons_dir || `${docs}/lessons`}/INDEX.md`) ? y : n)('team lessons index');
if (!tierLite) {
  (f(`${docs}/feature-workflow.md`) ? y : n)('feature workflow doc');
  (f(P.decisions_file || `${docs}/deferred-decisions.md`) ? y : n)('decision log');
  const req = P.requirements_dir || `${docs}/requirements`;
  const srcs = walk(join(ROOT, req), 3).filter((p) => statSync(p).isFile() && !p.endsWith('README.md'));
  (srcs.length ? y : n)(`requirement sources in ${req}`);
  (walk(ROOT, 3).some((p) => p.endsWith('graph.json') && p.includes('graphify-out')) ? y : w)('requirements graph (graphify-out/graph.json)');
  if (P.cases_dir) {
    const cases = walk(join(ROOT, P.cases_dir), 4).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))
      .reduce((a, p) => a + (readFileSync(p, 'utf8').match(/^\|\s*[A-Z]{3}-[A-Z0-9]{2,6}-\d{3}/gm) || []).length, 0);
    (f(P.cases_dir) ? y : n)(`cases in ${P.cases_dir} (${cases})`);
    (f(`${dirname(P.cases_dir)}/tools/cases-check.mjs`) ? y : n)('cases check tool');
  } else w('cases_dir not set — no cases-as-specification yet');
}
const ci = ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'buildspec.yml'].filter(f);
if (ci.length) console.log(`  CI: ${ci.join(' ')} (check it runs \`node scripts/gate.mjs\`)`);
else w('no CI config found — the local gate is the only gate');

console.log(`\npresent ${have} · missing ${miss} · warnings ${warn}`);
process.exit(miss ? 1 : 0);
