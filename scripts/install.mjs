#!/usr/bin/env node
// Install Specwright into a project. Safe on an EXISTING project: it merges,
// and never overwrites a file the project already has.
//
//   node install.mjs <project-root> [--config FILE] [--tier lite|standard|platform] [--dry-run]
//
//   <project-root>  where sessions will start: the repo root (single repo,
//                   monorepo) or the directory holding the repos (workspace)
//   --config FILE   a filled specwright.ini from the interview
//   --tier          overrides the tier in the config (default: standard)
//   --dry-run       print what would happen, change nothing
//
// Always: hooks (harness-owned, updated in place), settings.json MERGED,
// specwright.ini, scripts/gate.mjs + feature-start/end, CLAUDE.md, the
// open-questions register, the team lessons folder.
// standard adds: decision log, defect tracker, feature workflow, requirements
// README, rule template, bootstrap script, cases kit (when cases_dir is set).
// platform adds: the hotfix chain example.
// An existing file is never replaced: the template lands beside it as
// <name>.specwright-new for a person (or the agent) to merge.
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T = join(SKILL, 'templates');
const VERSION = readFileSync(join(SKILL, 'VERSION'), 'utf8').trim();
const TIERS = ['lite', 'standard', 'platform'];

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
const DRY = args.includes('--dry-run');
if (!ROOT || !existsSync(ROOT)) {
  console.error('usage: node install.mjs <project-root> [--config FILE] [--tier lite|standard|platform] [--dry-run]');
  process.exit(1);
}

const notes = [];
const rel = (p) => relative(ROOT, p).split('\\').join('/');
const act = (fn) => { if (!DRY) fn(); };
const mkdirFor = (p) => act(() => mkdirSync(dirname(p), { recursive: true }));

/** Write if absent; if present and different, write <dest>.specwright-new beside it. */
function place(src, dest, content) {
  const body = content ?? readFileSync(src, 'utf8');
  mkdirFor(dest);
  if (!existsSync(dest)) { act(() => writeFileSync(dest, body)); console.log(`added    ${rel(dest)}`); return; }
  if (readFileSync(dest, 'utf8') === body) { console.log(`same     ${rel(dest)}`); return; }
  act(() => writeFileSync(`${dest}.specwright-new`, body));
  console.log(`exists   ${rel(dest)}  (template saved as .specwright-new)`);
  notes.push(`Merge ${rel(dest)}.specwright-new into ${rel(dest)}, then delete it.`);
}

// --- config -----------------------------------------------------------------
const cfgDest = join(ROOT, '.claude', 'specwright.ini');
let cfgText;
if (opt('--config')) cfgText = readFileSync(opt('--config'), 'utf8');
else if (existsSync(cfgDest)) cfgText = readFileSync(cfgDest, 'utf8');
else {
  cfgText = readFileSync(join(T, 'workspace', '.claude', 'specwright.ini'), 'utf8');
  notes.push('Fill .claude/specwright.ini (placeholders __LIKE_THIS__ remain): units, gate steps, locations.');
}
const tier = opt('--tier') || (cfgText.match(/^tier\s*=\s*(\w+)/m) || [])[1];
const TIER = TIERS.includes(tier) ? tier : 'standard';
// Stamp tier and version, adding the keys under [project] if missing.
for (const [k, v] of [['tier', TIER], ['version', VERSION]]) {
  const re = new RegExp(`^${k}\\s*=.*$`, 'm');
  cfgText = re.test(cfgText) ? cfgText.replace(re, `${k} = ${v}`) : cfgText.replace(/^\[project\]\s*$/m, `[project]\n${k} = ${v}`);
}
const get = (key, dflt) => {
  const m = cfgText.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
  const v = m ? m[1].trim() : '';
  return !v || /^__[A-Z0-9_]+__$/.test(v) ? dflt : v;
};
const DOCS = get('docs_dir', 'docs');
const QS = get('questions_file', `${DOCS}/open-questions.md`);
const DEC = get('decisions_file', `${DOCS}/deferred-decisions.md`);
const REQ = get('requirements_dir', `${DOCS}/requirements`);
const LESSONS = get('lessons_dir', `${DOCS}/lessons`);
const CASES = get('cases_dir', '');
// Fill the location keys that were left as placeholders, so hooks and audit agree with what was placed.
for (const [k, v] of Object.entries({ docs_dir: DOCS, questions_file: QS, decisions_file: DEC, requirements_dir: REQ, lessons_dir: LESSONS })) {
  cfgText = cfgText.replace(new RegExp(`^(${k}\\s*=\\s*)__[A-Z0-9_]+__\\s*$`, 'm'), `$1${v}`);
}
console.log(`Specwright ${VERSION} → ${ROOT}  (tier: ${TIER})${DRY ? '  [dry run]' : ''}\n`);

console.log('== config');
mkdirFor(cfgDest);
act(() => writeFileSync(cfgDest, cfgText));
console.log(`wrote    ${rel(cfgDest)}`);

// --- hooks ------------------------------------------------------------------
console.log('== hooks');
const hookSrc = join(T, 'workspace', '.claude', 'hooks');
for (const f of readdirSync(hookSrc)) {
  const dest = join(ROOT, '.claude', 'hooks', f);
  mkdirFor(dest);
  act(() => copyFileSync(join(hookSrc, f), dest));
  console.log(`wrote    ${rel(dest)}`);
}
if (TIER === 'platform') place(join(T, 'workspace', '.claude', 'hotfix-chain.example'), join(ROOT, '.claude', 'hotfix-chain.example'));

// --- settings.json: merge hook entries whose command is not already wired ---
console.log('== settings.json (merge)');
const sDest = join(ROOT, '.claude', 'settings.json');
const want = JSON.parse(readFileSync(join(T, 'workspace', '.claude', 'settings.json'), 'utf8'));
if (!existsSync(sDest)) {
  act(() => writeFileSync(sDest, `${JSON.stringify(want, null, 2)}\n`));
  console.log(`added    ${rel(sDest)}`);
} else {
  const have = JSON.parse(readFileSync(sDest, 'utf8'));
  const before = JSON.stringify(have);
  have.hooks ??= {};
  for (const [event, groups] of Object.entries(want.hooks)) {
    const wired = new Set((have.hooks[event] ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command)));
    for (const g of groups) {
      const fresh = g.hooks.filter((h) => !wired.has(h.command));
      if (fresh.length) (have.hooks[event] ??= []).push({ ...g, hooks: fresh });
    }
  }
  if (JSON.stringify(have) === before) console.log(`same     ${rel(sDest)}`);
  else {
    act(() => { copyFileSync(sDest, `${sDest}.bak`); writeFileSync(sDest, `${JSON.stringify(have, null, 2)}\n`); });
    console.log(`merged   ${rel(sDest)}  (backup: settings.json.bak)`);
  }
}

// --- scripts ----------------------------------------------------------------
console.log('== scripts');
const scripts = ['gate.mjs', 'feature-start.mjs', 'feature-end.mjs', ...(TIER === 'lite' ? [] : ['bootstrap.mjs'])];
for (const s of scripts) place(join(T, 'workspace', 'scripts', s), join(ROOT, 'scripts', s));

// --- instructions -----------------------------------------------------------
console.log('== instructions');
const claudeTmpl = readFileSync(join(T, 'workspace', 'CLAUDE.md.tmpl'), 'utf8').replaceAll('__LESSONS_DIR__', LESSONS);
const claudeDest = join(ROOT, 'CLAUDE.md');
if (existsSync(claudeDest)) {
  act(() => writeFileSync(`${claudeDest}.specwright-new`, claudeTmpl));
  console.log('exists   CLAUDE.md  (template saved as CLAUDE.md.specwright-new)');
  notes.push('Merge CLAUDE.md.specwright-new into CLAUDE.md: keep every existing rule; conflicts go to the open questions.');
} else {
  act(() => writeFileSync(claudeDest, claudeTmpl));
  console.log('added    CLAUDE.md  (fill the __PLACEHOLDERS__ from the interview)');
}
const others = ['AGENTS.md', '.cursorrules', '.cursor/rules', '.github/copilot-instructions.md', '.windsurfrules']
  .filter((p) => existsSync(join(ROOT, p)));
if (others.length) notes.push(`Other agent instruction files exist (${others.join(', ')}): compare them with CLAUDE.md for contradictions BEFORE merging or importing.`);
if (TIER !== 'lite') place(join(T, 'repo', '.claude', 'rules', '_template.md'), join(ROOT, '.claude', 'rules', '_template.md'));

// --- docs -------------------------------------------------------------------
console.log('== docs');
const D = join(T, 'workspace', 'docs');
place(join(D, 'open-questions.md'), join(ROOT, QS));
for (const f of readdirSync(join(D, 'lessons'))) place(join(D, 'lessons', f), join(ROOT, LESSONS, f));
if (TIER !== 'lite') {
  place(join(D, 'feature-workflow.md'), join(ROOT, DOCS, 'feature-workflow.md'));
  place(join(D, 'deferred-decisions.md'), join(ROOT, DEC));
  place(join(D, 'defects.csv'), join(ROOT, DOCS, 'defects.csv'));
  // Never move existing sources: the README goes beside them, and a
  // sources/ folder is created only when the directory is new.
  const reqDir = join(ROOT, REQ);
  if (!existsSync(reqDir)) act(() => mkdirSync(join(reqDir, 'sources'), { recursive: true }));
  place(join(D, 'README.requirements.md'), join(reqDir, 'README.md'));
  if (CASES) {
    console.log('== cases');
    place(join(T, 'e2e', 'cases', 'README.md'), join(ROOT, CASES, 'README.md'));
    place(join(T, 'e2e', 'cases', 'screens', 'example.md'), join(ROOT, CASES, 'screens', 'example.md'));
    place(join(T, 'e2e', 'tools', 'cases-check.mjs'), join(ROOT, dirname(CASES), 'tools', 'cases-check.mjs'));
    notes.push(`Add the cases check to [gate]: cases = node ${dirname(CASES)}/tools/cases-check.mjs (set CASES_DIR/TESTS_DIR if not cases/ and tests/).`);
  }
} else {
  notes.push('lite tier: no decision log, workflow doc or cases kit. Re-run with --tier standard when the project grows.');
}

// --- graphify ---------------------------------------------------------------
const hasGraphify = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['graphify'], { encoding: 'utf8' }).status === 0;
if (!hasGraphify) notes.push('graphify is REQUIRED and not on PATH: `uv tool install graphifyy` (or `pipx install graphifyy`), then `graphify install`.');

if (!DRY) {
  console.log('');
  spawnSync(process.execPath, [join(SKILL, 'scripts', 'audit.mjs'), ROOT], { stdio: 'inherit' });
}
console.log('\n== to do by hand');
for (const n of notes) console.log(`  - ${n}`);
