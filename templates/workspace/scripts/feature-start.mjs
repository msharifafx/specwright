#!/usr/bin/env node
// Start a feature: a git worktree for every git repo the units live in, all on
// feat/<name>, under one directory that mirrors this project root — so a
// session opened there behaves exactly as it does here.
//
//   node scripts/feature-start.mjs orders-bulk-export
//
//   single repo / monorepo → one worktree, the whole repo
//   workspace of repos     → a worktree per repo at the same relative path
//
// WHY A WORKTREE PER FEATURE. Several sessions (people or agents) work at once.
// In a shared checkout one session's `git add -A` commits another's
// half-finished files, and a branch switch moves the floor under everyone.
import { git, gitRoots, isInside, loadConfig, sh } from '../.claude/hooks/lib.mjs';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const name = process.argv[2];
if (!name) { console.error('usage: node scripts/feature-start.mjs <feature-name>'); process.exit(1); }
const cfg = loadConfig();
const ROOT = cfg.root;
const branch = `feat/${name}`;
const dest = join(dirname(ROOT), `${cfg.project.worktree_prefix || 'feat-'}${name}`);
if (existsSync(dest)) { console.error(`ERROR: ${dest} already exists.`); process.exit(1); }

const roots = gitRoots(cfg);
if (!roots.length) { console.error('ERROR: no unit in .claude/specwright.ini is inside a git repo.'); process.exit(1); }
const outside = roots.find((r) => !isInside(r, ROOT));
if (outside) {
  console.error(`ERROR: ${outside} is outside ${ROOT}. Put sibling repos under one directory so a feature can mirror it.`);
  process.exit(1);
}

function addWorktree(repo, target) {
  // Branch from an UP-TO-DATE default branch: a worktree cut from a stale one
  // fails the gate in files you never touched.
  git(repo, ['fetch', '-q']);
  const base = git(repo, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']) || git(repo, ['branch', '--show-current']);
  if (git(repo, ['worktree', 'add', '-q', target, '-b', branch, base]) === null) {
    console.error(`ERROR: git worktree add failed in ${repo}`); process.exit(1);
  }
  console.log(`worktree: ${target}  (${branch} from ${base})`);
}

const rootIsRepo = roots.some((r) => resolve(r) === resolve(ROOT));
if (rootIsRepo) addWorktree(ROOT, dest); else mkdirSync(dest, { recursive: true });
for (const r of roots) if (resolve(r) !== resolve(ROOT)) addWorktree(r, join(dest, relative(ROOT, r)));

// Instructions and hooks that git does not track do not arrive with a
// worktree. Copy them without overwriting tracked copies.
if (existsSync(join(ROOT, 'CLAUDE.md')) && !existsSync(join(dest, 'CLAUDE.md'))) cpSync(join(ROOT, 'CLAUDE.md'), join(dest, 'CLAUDE.md'));
cpSync(join(ROOT, '.claude'), join(dest, '.claude'), {
  recursive: true, force: false, errorOnExist: false,
  filter: (src) => !src.includes(`${join('.claude', '.specwright')}`),
});

// STEP ZERO: dependencies in every unit, else the lint hook reports "NOT
// linted" on every edit. .env is gitignored, so it is copied (not linked, so
// a feature can use its own ports).
for (const u of cfg.units) {
  const target = join(dest, relative(ROOT, u.dir));
  if (existsSync(join(u.dir, '.env')) && !existsSync(join(target, '.env'))) cpSync(join(u.dir, '.env'), join(target, '.env'));
  if (!u.install) continue;
  console.log(`install: ${u.name}`);
  const r = sh(u.install, target, 15 * 60_000);
  if (r.status !== 0) console.error(`  install failed in ${target} — run it by hand:\n  ${u.install}`);
}
console.log(`\nReady: ${dest}\n  cd ${dest} && claude\nFinish: node ${join(ROOT, 'scripts', 'feature-end.mjs')} ${basename(dest)}`);
