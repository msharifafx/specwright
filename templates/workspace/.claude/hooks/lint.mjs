// PostToolUse hook: lint the file just written, with the linter of the unit
// that owns it (specwright.ini).
//
// WHY A HOOK AND NOT AN INSTRUCTION. A rule the agent may forget is a hope; a
// lint error in the same step as the edit is a rule.
//
// Exit 2 puts stderr in front of the agent (for PostToolUse the edit has
// already happened; this is feedback, not a veto). Exit 0 with no output when
// the file is clean, so a clean edit costs nothing.
import { commandMissing, head, loadConfig, quote, readStdinJson, sh, unitFor } from './lib.mjs';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';

const input = await readStdinJson();
const given = input.tool_input?.file_path;
if (!given) process.exit(0);
const file = isAbsolute(given) ? given : resolve(input.cwd || process.cwd(), given);
if (!existsSync(file)) process.exit(0);

const cfg = loadConfig();
const unit = unitFor(cfg, file);
if (!unit || !unit.lint) process.exit(0);
if (!unit.exts.includes(extname(file).slice(1).toLowerCase())) process.exit(0);

const r = sh(unit.lint.replaceAll('{file}', quote(file)), unit.dir, 50_000);
if (r.status === 0) process.exit(0);

if (commandMissing(r)) {
  // Say so loudly: silence would read as "clean".
  process.stderr.write(`lint hook: ${file} NOT linted — the linter for unit "${unit.name}" did not run. ` +
    `Install its dependencies (${unit.install || 'its install command'}) in ${unit.dir}.\n${head(r.out, 5)}\n`);
} else if (r.timedOut) {
  process.stderr.write(`lint hook: linting ${file} took over 50s and was stopped. Lint one file, not the whole unit.\n`);
} else {
  process.stderr.write(`lint findings in ${file} (unit "${unit.name}") — fix before moving on:\n${head(r.out)}\n`);
}
process.exit(2);
