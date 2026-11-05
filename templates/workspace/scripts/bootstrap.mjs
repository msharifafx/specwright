#!/usr/bin/env node
// Workspace-of-repos layout only: clone each unit that is its own repo,
// install its dependencies, and give it its own copy of the hooks and a
// config naming only itself — a session started inside a repo reads only
// that repo's .claude/. Idempotent. Single repos and monorepos do not need it.
//
//   node scripts/bootstrap.mjs
import { git, loadConfig, samePath, sh } from '../.claude/hooks/lib.mjs';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const cfg = loadConfig();
const ROOT = cfg.root;
const base = process.env.SPECWRIGHT_GIT_BASE || cfg.project.git_base;
const projectBlock = readFileSync(join(ROOT, '.claude', 'specwright.ini'), 'utf8').split(/^\[unit /m)[0].replace(/\n\[gate\][\s\S]*/, '');

for (const u of cfg.units) {
  if (samePath(u.dir, ROOT)) continue;
  if (!existsSync(u.dir)) {
    if (!base) { console.log(`${u.name}: missing and git_base is unset in specwright.ini`); continue; }
    if (git(ROOT, ['clone', `${base}/${basename(u.dir)}.git`, u.dir]) === null) { console.error(`${u.name}: clone failed`); continue; }
  } else if (existsSync(join(u.dir, '.git'))) {
    if (git(u.dir, ['pull', '--ff-only', '-q']) === null) console.log(`${u.name}: pull skipped`);
  }
  if (u.install && sh(u.install, u.dir, 15 * 60_000).status !== 0) console.error(`${u.name}: install failed — run: ${u.install}`);
  if (existsSync(join(u.dir, '.git'))) {
    mkdirSync(join(u.dir, '.claude'), { recursive: true });
    cpSync(join(ROOT, '.claude', 'hooks'), join(u.dir, '.claude', 'hooks'), { recursive: true });
    if (!existsSync(join(u.dir, '.claude', 'settings.json'))) cpSync(join(ROOT, '.claude', 'settings.json'), join(u.dir, '.claude', 'settings.json'));
    const own = ['path = .', u.exts.length && `exts = ${u.exts.join(' ')}`, u.lint && `lint = ${u.lint}`,
      u.typecheck && `typecheck = ${u.typecheck}`, u.install && `install = ${u.install}`].filter(Boolean).join('\n');
    writeFileSync(join(u.dir, '.claude', 'specwright.ini'), `${projectBlock.trimEnd()}\n\n[unit ${u.name}]\n${own}\n`);
  }
  console.log(`${u.name}: ready`);
}
