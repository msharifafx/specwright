#!/usr/bin/env node
// Remove a feature worktree set created by feature-start.mjs.
// Never forces: git refuses a dirty worktree, and uncommitted work is a reason
// to stop, not to delete. Branches live in the main checkout and SURVIVE.
import { git, gitRoots, loadConfig } from '../.claude/hooks/lib.mjs';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const dirName = process.argv[2];
if (!dirName) { console.error('usage: node scripts/feature-end.mjs <worktree-dir-name>'); process.exit(1); }
const cfg = loadConfig();
const ROOT = cfg.root;
const wt = join(dirname(ROOT), dirName);
if (!existsSync(wt)) { console.error(`no such directory: ${wt}`); process.exit(1); }

const roots = gitRoots(cfg);
let ok = true;
const remove = (repo, target) => {
  if (!existsSync(join(target, '.git'))) return;
  console.log(`removing ${target}`);
  if (git(repo, ['worktree', 'remove', target]) === null) {
    ok = false;
    console.error(`  refused: ${target} has uncommitted or untracked work. Commit or stash it, then run again.`);
  }
};
for (const r of roots) if (resolve(r) !== resolve(ROOT)) remove(r, join(wt, relative(ROOT, r)));
if (roots.some((r) => resolve(r) === resolve(ROOT))) remove(ROOT, wt);
if (!ok) process.exit(1);
rmSync(wt, { recursive: true, force: true });
for (const r of roots) git(r, ['worktree', 'prune']);
console.log(`done: ${dirName}`);
