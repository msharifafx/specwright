#!/usr/bin/env node
// Self-test for Specwright. Builds throwaway projects in a temp directory — a
// monorepo with two toolchains, a workspace of two repos, an existing project
// — installs the hooks, and exercises them with fake linters written in Node,
// so it runs identically on Windows, macOS and Linux. Touches nothing outside
// its temp directory. CI runs it on all three.
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T = mkdtempSync(join(tmpdir(), 'specwright-'));
const NODE = JSON.stringify(process.execPath); // quoted: may contain spaces on Windows
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); ok ? pass++ : fail++; };
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: ENV });
const node = (script, args = [], opts = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: ENV, ...opts });
const hook = (root, name, payload) => node(join(root, '.claude', 'hooks', `${name}.mjs`), [], { input: JSON.stringify(payload), cwd: root });
const script = (root, name, ...a) => node(join(root, 'scripts', `${name}.mjs`), a, { cwd: root });
const init = (dir) => { mkdirSync(dir, { recursive: true }); git(dir, 'init', '-q', '-b', 'main'); git(dir, 'commit', '-q', '--allow-empty', '-m', 'init'); };
const commitAll = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); };

// Fake tools, in Node so every shell runs them the same way.
const fakeLint = (tag) => `${NODE} -e "const f=process.argv[1];if(require('fs').readFileSync(f,'utf8').includes('LINTBAD')){console.log('${tag}-BAD',f);process.exit(1)}" {file}`;
const fakeTypecheck = (file) => `${NODE} -e "process.exit(require('fs').readFileSync('${file}','utf8').includes('BROKEN')?1:0)"`;

function installInto(root, ini) {
  mkdirSync(join(root, '.claude'), { recursive: true });
  cpSync(join(SKILL, 'templates', 'workspace', '.claude', 'hooks'), join(root, '.claude', 'hooks'), { recursive: true });
  cpSync(join(SKILL, 'templates', 'workspace', '.claude', 'settings.json'), join(root, '.claude', 'settings.json'));
  cpSync(join(SKILL, 'templates', 'workspace', 'scripts'), join(root, 'scripts'), { recursive: true });
  write(join(root, '.claude', 'specwright.ini'), `[project]\nproduct = T\nworktree_prefix = t-\n\n${ini}`);
  write(join(root, 'CLAUDE.md'), '# test\n');
}

try {
  console.log('== monorepo: two units, two toolchains');
  const M = join(T, 'mono');
  init(M);
  write(join(M, 'web', 'src.ts'), 'ok\n');
  write(join(M, 'api', 'a.py'), 'ok\n');
  installInto(M, `[unit web]\npath = web\nexts = ts\nlint = ${fakeLint('TS')}\ntypecheck = ${fakeTypecheck('src.ts')}\n\n[unit api]\npath = api\nexts = py\nlint = ${fakeLint('PY')}\n\n[gate]\nfirst = ${NODE} -e "console.log('step1')"\nsecond = ${NODE} -e "process.exit(3)"\n`);
  commitAll(M, 'files');

  let r = hook(M, 'lint', { tool_input: { file_path: join(M, 'web', 'src.ts') } });
  check('lint: clean file → exit 0, silent', r.status === 0 && r.stderr === '');
  write(join(M, 'web', 'src.ts'), 'LINTBAD\n');
  r = hook(M, 'lint', { tool_input: { file_path: join(M, 'web', 'src.ts') } });
  check('lint: finding → exit 2, shown to the agent, web unit linter used', r.status === 2 && r.stderr.includes('TS-BAD'));
  write(join(M, 'api', 'a.py'), 'LINTBAD\n');
  r = hook(M, 'lint', { tool_input: { file_path: join(M, 'api', 'a.py') } });
  check('lint: api file uses the api unit linter', r.status === 2 && r.stderr.includes('PY-BAD'));
  write(join(M, 'README.md'), 'x');
  r = hook(M, 'lint', { tool_input: { file_path: join(M, 'README.md') } });
  check('lint: file no unit owns → ignored', r.status === 0);
  git(M, 'checkout', '-q', '--', '.');

  r = hook(M, 'turn-start', {});
  check('turn-start records HEAD', r.status === 0 && existsSync(join(M, '.claude', '.specwright', 'turn-start.json')));
  r = hook(M, 'gate', {});
  check('gate: clean tree → passes', r.status === 0);
  write(join(M, 'web', 'src.ts'), 'BROKEN\n');
  r = hook(M, 'gate', {});
  check('gate: failing typecheck (uncommitted) → blocks with exit 2', r.status === 2 && r.stderr.includes('typecheck FAILED'));
  r = hook(M, 'gate', { stop_hook_active: true });
  check('gate: does not re-fire when stop_hook_active', r.status === 0);
  commitAll(M, 'broken but committed');
  r = hook(M, 'gate', {});
  check('gate: failure COMMITTED during the turn still blocks', r.status === 2);
  write(join(M, 'web', 'src.ts'), 'ok\n'); commitAll(M, 'fixed');

  r = script(M, 'gate');
  check('gate.mjs runs steps in order and stops at the failing one', r.status === 1 && r.stdout.includes('step1') && r.stderr.includes('"second"'));

  r = script(M, 'feature-start', 'demo');
  check('feature-start: one worktree for a monorepo', existsSync(join(T, 't-demo', '.git')) && existsSync(join(T, 't-demo', '.claude', 'specwright.ini')));
  check('feature-start: on feat/demo', git(join(T, 't-demo'), 'branch', '--show-current').stdout.trim() === 'feat/demo');
  r = hook(join(T, 't-demo'), 'lint', { tool_input: { file_path: join(T, 't-demo', 'web', 'src.ts') } });
  check('lint inside the worktree resolves its own units', r.status === 0);
  write(join(T, 't-demo', 'web', 'new.ts'), 'x');
  r = script(M, 'feature-end', 't-demo');
  check('feature-end refuses a worktree with untracked work', r.status === 1 && existsSync(join(T, 't-demo')));
  rmSync(join(T, 't-demo', 'web', 'new.ts'));
  r = script(M, 'feature-end', 't-demo');
  check('feature-end removes it once clean; branch survives', !existsSync(join(T, 't-demo')) && git(M, 'rev-parse', '-q', '--verify', 'feat/demo').status === 0);

  console.log('== hotfix propagation (refs only, no checkout touched)');
  git(M, 'branch', 'uat'); git(M, 'branch', 'release');
  write(join(M, '.claude', 'hotfix-chain'), 'release\nuat\nmain\n');
  write(join(M, '.git', 'info', 'exclude'), '.claude/hotfix-chain\n.claude/.specwright/\n');
  const wtRelease = join(T, 'rel-wt');
  git(M, 'worktree', 'add', '-q', wtRelease, 'release');
  write(join(wtRelease, 'web', 'fix.ts'), 'fix\n'); commitAll(wtRelease, 'hotfix: the fix');
  write(join(wtRelease, 'web', 'feat.ts'), 'feat\n'); commitAll(wtRelease, 'feat: not a fix');
  git(M, 'worktree', 'remove', wtRelease);
  const mainHead = git(M, 'rev-parse', 'HEAD').stdout.trim();
  r = hook(M, 'hotfix', {});
  const uatLog = git(M, 'log', '--format=%s', 'uat').stdout;
  check('hotfix moved release → uat by ref', uatLog.includes('hotfix: propagate release into uat') && uatLog.includes('hotfix: the fix'));
  check('hotfix did NOT move main (checked out) and said so', git(M, 'rev-parse', 'HEAD').stdout.trim() === mainHead && r.stdout.includes('checked out'));
  check('working tree untouched', git(M, 'status', '--porcelain').stdout.trim() === '');
  rmSync(join(M, '.claude', 'hotfix-chain'));

  console.log('== workspace of two separate repos');
  const W = join(T, 'ws');
  init(join(W, 'server')); init(join(W, 'web'));
  installInto(W, `[unit server]\npath = server\nexts = ts\nlint = ${fakeLint('S')}\n\n[unit web]\npath = web\nexts = ts\nlint = ${fakeLint('W')}\ninstall = ${NODE} -e "1"\n`);
  r = script(W, 'feature-start', 'two');
  check('a worktree per repo at the mirrored path', existsSync(join(T, 't-two', 'server', '.git')) && existsSync(join(T, 't-two', 'web', '.git')));
  check('workspace CLAUDE.md and hooks copied', existsSync(join(T, 't-two', 'CLAUDE.md')) && existsSync(join(T, 't-two', '.claude', 'hooks', 'lint.mjs')));
  write(join(T, 't-two', 'web', 'x.ts'), 'LINTBAD');
  r = hook(join(T, 't-two'), 'lint', { tool_input: { file_path: join(T, 't-two', 'web', 'x.ts') } });
  check('lint in the worktree uses the web repo unit', r.status === 2 && r.stderr.includes('W-BAD'));
  rmSync(join(T, 't-two', 'web', 'x.ts'));
  r = script(W, 'feature-end', 't-two');
  check('feature-end removes both', !existsSync(join(T, 't-two')));
  r = script(W, 'bootstrap');
  check('bootstrap gives each repo its own hooks and config', existsSync(join(W, 'web', '.claude', 'hooks', 'gate.mjs')) && /path = \./.test(readFileSync(join(W, 'web', '.claude', 'specwright.ini'), 'utf8')));

  console.log('== lint reports a missing linter');
  const N = join(T, 'nolint'); init(N);
  installInto(N, '[unit app]\npath = .\nexts = ts\nlint = definitely-not-a-linter-xyz {file}\n');
  write(join(N, 'a.ts'), 'x');
  r = hook(N, 'lint', { tool_input: { file_path: join(N, 'a.ts') } });
  check('says NOT linted (exit 2) when the linter is absent', r.status === 2 && r.stderr.includes('NOT linted'));

  console.log('== config parsing');
  const lib = await import(new URL(`file://${join(SKILL, 'templates', 'workspace', '.claude', 'hooks', 'lib.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}`).href);
  const parsed = lib.parseConfig('[project]\nproduct = X\n\n[unit a]\npath = .\ntypcheck = tsc\nlint = a | b && c = d\n');
  check('a typo in a key is reported, not ignored', parsed.problems.some((p) => p.includes('typcheck')));
  check('values keep pipes, && and =', parsed.units[0].lint === 'a | b && c = d');

  console.log('== cases check');
  const C = join(T, 'cases');
  write(join(C, 'cases', 's.md'), '| ID | Case | Steps | Expected |\n|--|--|--|--|\n| ABC-XY-001 | a | b | c |\n| ABC-XY-002 SKIP | a | b | Not yet; unlike ABC-XY-003 |\n');
  write(join(C, 'tests', 's.spec.ts'), "test('ABC-XY-001 works', () => {})\n");
  const cc = join(SKILL, 'templates', 'e2e', 'tools', 'cases-check.mjs');
  check('passes when every case is scripted or SKIP', node(cc, [], { cwd: C }).status === 0);
  write(join(C, 'tests', 's.spec.ts'), "test('ABC-XY-001 works', () => {})\ntest('ABC-XY-009 orphan', () => {})\n");
  check('fails on a script with no case', node(cc, [], { cwd: C }).status !== 0);

  console.log('== installer on an existing project');
  const P = join(T, 'existing'); init(P);
  write(join(P, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  write(join(P, 'CLAUDE.md'), '# our rules\n');
  write(join(T, 'cfg.ini'), `[project]\nproduct = P\ntier = standard\ndocs_dir = doc\n\n[unit app]\npath = .\nexts = ts\nlint = ${fakeLint('A')}\n\n[gate]\nlint = echo ok\n`);
  const inst = join(SKILL, 'scripts', 'install.mjs');
  r = node(inst, [P, '--config', join(T, 'cfg.ini')]);
  const s1 = JSON.parse(readFileSync(join(P, '.claude', 'settings.json'), 'utf8'));
  check('existing hook and permissions kept', s1.permissions.allow[0] === 'Bash(ls)' && s1.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'echo mine')));
  check('Specwright hooks wired', JSON.stringify(s1).includes('node .claude/hooks/gate.mjs'));
  check('existing CLAUDE.md untouched, template beside it', readFileSync(join(P, 'CLAUDE.md'), 'utf8') === '# our rules\n' && existsSync(join(P, 'CLAUDE.md.specwright-new')));
  check('docs land in the configured docs_dir', existsSync(join(P, 'doc', 'open-questions.md')) && existsSync(join(P, 'doc', 'lessons', 'INDEX.md')));
  check('version stamped into the config', /^version = \d/m.test(readFileSync(join(P, '.claude', 'specwright.ini'), 'utf8')));
  node(inst, [P, '--config', join(T, 'cfg.ini')]);
  const s2 = JSON.parse(readFileSync(join(P, '.claude', 'settings.json'), 'utf8'));
  check('second install adds no duplicate hooks', s2.hooks.Stop.flatMap((g) => g.hooks).length === 3);
  const L = join(T, 'lite'); init(L);
  node(inst, [L, '--tier', 'lite']);
  check('lite tier skips decision log and workflow doc', existsSync(join(L, 'docs', 'open-questions.md')) && !existsSync(join(L, 'docs', 'deferred-decisions.md')));
} finally {
  rmSync(T, { recursive: true, force: true });
}

console.log(`\npassed ${pass}, failed ${fail}`);
process.exit(fail ? 1 : 0);
