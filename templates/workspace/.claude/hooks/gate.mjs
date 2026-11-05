// Stop hook: block the turn from ending while typecheck fails in any unit the
// turn touched — uncommitted changes AND commits made since the turn began.
//
// WHY TYPECHECK AND NOT THE FULL GATE. Lint runs per file on every edit; the
// gap it cannot see is cross-file breakage. Typecheck closes it. The full gate
// runs before a PR.
//
//  * exit 2 blocks and puts stderr in front of the agent; exit 1 is a hook
//    ERROR and is ignored. A gate that exits 1 gates nothing.
//  * stop_hook_active is true on the turn this hook already blocked once;
//    without the check it re-fires forever.
//  * A typecheck that runs past its budget BLOCKS with a message rather than
//    passing silently: a slow check must be made incremental, not skipped.
import { STATE_DIR, git, head, loadConfig, readStdinJson, relPath, sh } from './lib.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const input = await readStdinJson();
if (input.stop_hook_active) process.exit(0);

const cfg = loadConfig();
let start = {};
try { start = JSON.parse(readFileSync(join(STATE_DIR, 'turn-start.json'), 'utf8')).heads || {}; } catch { /* first turn */ }

function touchedFiles(unit) {
  if (!existsSync(unit.dir)) return [];
  const top = git(unit.dir, ['rev-parse', '--show-toplevel']);
  if (!top) return [];
  const files = [];
  const status = git(unit.dir, ['status', '--porcelain', '--untracked-files=all', '--', '.']) || '';
  for (const l of status.split('\n')) if (l.length > 3) files.push(l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));
  const was = Object.entries(start).find(([k]) => k.toLowerCase() === top.toLowerCase())?.[1];
  const now = git(unit.dir, ['rev-parse', 'HEAD']);
  if (was && now && was !== now) {
    const committed = git(unit.dir, ['diff', '--name-only', `${was}..${now}`, '--', '.']) || '';
    files.push(...committed.split('\n').filter(Boolean));
  }
  return files;
}

const failed = [];
for (const unit of cfg.units) {
  if (!unit.typecheck) continue;
  if (!touchedFiles(unit).some((f) => unit.exts.includes(extname(f).slice(1).toLowerCase()))) continue;
  const budget = Number(unit.typecheck_timeout || cfg.project.typecheck_timeout || 150) * 1000;
  const r = sh(unit.typecheck, unit.dir, budget);
  if (r.timedOut) {
    failed.push(`--- ${relPath(unit.dir)} ---\ntypecheck ran past ${budget / 1000}s and was stopped. ` +
      'Use an incremental mode (tsc -b, mypy --incremental, cargo check) or raise typecheck_timeout in specwright.ini.');
  } else if (r.status !== 0) {
    const lines = r.out.split(/\r?\n/).filter((l) => /error|Error|✖|:\d+:/.test(l));
    failed.push(`--- ${relPath(unit.dir)} ---\n${head((lines.length ? lines : r.out.split('\n')).join('\n'), 20)}`);
  }
}

if (failed.length) {
  process.stderr.write(`typecheck FAILED — fix before finishing.\n${failed.join('\n')}\n` +
    '(If the code is fine, the hook shell may not find the toolchain: run the command yourself.)\n');
  process.exit(2);
}
process.exit(0);
