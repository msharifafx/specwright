// Specwright — shared code for every hook and script.
//
// Plain Node (18+), no dependencies, so it runs natively on Windows, macOS
// and Linux. Bash was dropped because Windows has none by default and macOS
// ships bash 3.2.
//
// This file sits at <root>/.claude/hooks/lib.mjs. A copy lives wherever a
// session may start (the project root, each separate repo, each feature
// worktree), because Claude Code reads .claude/settings.json from the
// SESSION's project root only.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPECWRIGHT_VERSION = '2.0.0';
export const IS_WINDOWS = process.platform === 'win32';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONFIG_FILE = join(ROOT, '.claude', 'specwright.ini');
export const STATE_DIR = join(ROOT, '.claude', '.specwright');

const PROJECT_KEYS = new Set([
  'product', 'tier', 'version', 'docs_dir', 'requirements_dir', 'cases_dir', 'tests_dir',
  'decisions_file', 'questions_file', 'lessons_dir', 'worktree_prefix', 'gate_cmd',
  'git_base', 'typecheck_timeout',
]);
const UNIT_KEYS = new Set(['path', 'exts', 'lint', 'typecheck', 'install', 'typecheck_timeout']);

/** An unfilled template placeholder (__LIKE_THIS__) counts as unset. */
const clean = (v) => (v === undefined || /^__[A-Z0-9_]+__$/.test(v) ? '' : v);

/**
 * Parse specwright.ini:
 *   [project]      key = value ...
 *   [unit <name>]  path, exts, lint, typecheck, install, typecheck_timeout
 *   [gate]         <step name> = <command>, run in order by scripts/gate.mjs
 * Values run to the end of the line, so commands may hold pipes, quotes and
 * `=`. Lines starting with # or ; are comments. Unknown keys are kept in
 * `problems` so the audit can report a typo instead of silently ignoring it.
 */
export function parseConfig(text) {
  const cfg = { project: {}, units: [], gate: [], problems: [] };
  let section = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) return;
    const head = line.match(/^\[(.+)\]$/);
    if (head) {
      const name = head[1].trim();
      if (name === 'project') section = cfg.project;
      else if (name === 'gate') section = 'gate';
      else if (name.startsWith('unit ')) {
        section = { name: name.slice(5).trim() };
        cfg.units.push(section);
      } else {
        section = null;
        cfg.problems.push(`line ${i + 1}: unknown section [${name}]`);
      }
      return;
    }
    const eq = line.indexOf('=');
    if (eq < 0 || section === null) {
      cfg.problems.push(`line ${i + 1}: not "key = value" inside a section: ${line}`);
      return;
    }
    const key = line.slice(0, eq).trim();
    const value = clean(line.slice(eq + 1).trim());
    if (section === 'gate') {
      cfg.gate.push({ name: key, cmd: value });
      return;
    }
    const allowed = section === cfg.project ? PROJECT_KEYS : UNIT_KEYS;
    if (!allowed.has(key)) cfg.problems.push(`line ${i + 1}: unknown key "${key}"`);
    section[key] = value;
  });
  return cfg;
}

export function loadConfig(root = ROOT) {
  const file = join(root, '.claude', 'specwright.ini');
  const cfg = existsSync(file)
    ? parseConfig(readFileSync(file, 'utf8'))
    : { project: {}, units: [], gate: [], problems: ['no .claude/specwright.ini'] };
  cfg.root = root;
  cfg.units = cfg.units
    .filter((u) => u.path)
    .map((u) => ({
      ...u,
      dir: resolve(root, u.path),
      exts: (u.exts || '').split(/[\s,]+/).filter(Boolean).map((e) => e.replace(/^\./, '').toLowerCase()),
    }));
  return cfg;
}

/** Compare paths the way the file system does: case-insensitive on Windows. */
const norm = (p) => (IS_WINDOWS ? resolve(p).toLowerCase() : resolve(p));

export function isInside(file, dir) {
  const rel = relative(norm(dir), norm(file));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The unit owning a file = the unit whose directory is the LONGEST prefix. */
export function unitFor(cfg, file) {
  return cfg.units
    .filter((u) => isInside(file, u.dir))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
}

/** Run git without a shell. Returns trimmed stdout, or null on failure. */
export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Distinct git working trees the units live in (one for a monorepo). */
export function gitRoots(cfg) {
  const roots = new Map();
  for (const u of cfg.units) {
    if (!existsSync(u.dir)) continue;
    const top = git(u.dir, ['rev-parse', '--show-toplevel']);
    if (top) roots.set(norm(top), resolve(top));
  }
  return [...roots.values()];
}

/**
 * Run a project command through the platform shell (cmd.exe on Windows,
 * /bin/sh elsewhere), so commands are written the way the team writes them.
 */
export function sh(cmd, cwd, timeoutMs = 120_000) {
  const r = spawnSync(cmd, {
    cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM',
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
}

/**
 * The command was not found at all: POSIX 127, cmd.exe 9009, or the
 * messages both shells print. Almost always a fresh worktree with no
 * dependencies installed.
 */
export const commandMissing = (r) =>
  r.status === 127 || r.status === 9009 ||
  /command not found|is not recognized as an internal or external command|Cannot find module/i.test(r.out);

/** Quote a path for the platform shell. */
export const quote = (p) => `"${p.replace(/"/g, IS_WINDOWS ? '""' : '\\"')}"`;

export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

export const head = (text, n = 40) => text.split(/\r?\n/).slice(0, n).join('\n');

export const relPath = (p) => relative(ROOT, p).split(sep).join('/') || '.';
