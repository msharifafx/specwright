/**
 * Keep `cases/` and `tests/` from drifting apart.
 *
 * The cases are the source of truth, so the failure this guards against is not
 * "a test is missing" but "somebody changed the truth and nobody changed the
 * scripts". Both directions are reported, because a script with no case is just
 * as wrong: it is behaviour nobody agreed to test, and no tester can review it.
 *
 * The join is the ID. A script claims a case by putting the ID at the start of
 * its test title:
 *
 *   test('MAS-CN-004 · a duplicate code is refused by the server', ...)
 *
 * Exits non-zero on any difference, and is part of `pnpm gate`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ID = /\b([A-Z]{3}-[A-Z0-9]{2,6}-\d{3})\b/g;

function walk(dir, match) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match.test(entry)) out.push(path);
  }
  return out;
}

function idsIn(files) {
  const found = new Map();
  for (const file of files) {
    for (const [, id] of readFileSync(file, 'utf8').matchAll(ID)) {
      // By FILE, not by occurrence: an ID may legitimately appear twice in one
      // document — in its row and in a note about it — and that is not a
      // duplicate definition.
      const seen = found.get(id) ?? new Set();
      seen.add(file);
      found.set(id, seen);
    }
  }
  return new Map([...found].map(([id, files]) => [id, [...files]]));
}

// README.md is the contract for this directory and contains an EXAMPLE row.
// Scanning it would turn that example into a case nobody ever agreed to.
const cases = idsIn(walk('cases', /\.md$/).filter((f) => !f.endsWith('README.md')));
const scripts = idsIn(walk('tests', /\.(spec|ts)$/));

const problems = [];

// A case marked SKIP is a decision, not a gap: somebody wrote it down and said
// why it is not automated yet. Reported in the count, never as a failure.
// Matched on the row that DEFINES the id, not on any line mentioning it:
// `l.includes('PAY-SC-007')` also matches the row for `PAY-SC-007b`, and that
// row's SKIP status has nothing to do with this case's.
const definingRow = (id, file) => {
  const row = new RegExp(`^\\|\\s*${id}(\\s+SKIP)?\\s*\\|`);
  return readFileSync(file, 'utf8').split('\n').find((l) => row.test(l)) ?? '';
};
const isSkipped = (id, file) => /\bSKIP\b/.test(definingRow(id, file));

for (const [id, files] of cases) {
  if (files.length > 1) {
    problems.push(`${id} is defined in more than one case file: ${files.join(', ')}`);
  }
  if (!scripts.has(id) && !isSkipped(id, files[0])) {
    problems.push(`${id} has no script. Written down, never automated — script it, or mark it SKIP with a reason.`);
  }
}
for (const [id] of scripts) {
  if (!cases.has(id)) problems.push(`${id} is asserted by a script but is in no case file.`);
}

const skipped = [...cases.keys()].filter((id) => isSkipped(id, cases.get(id)[0]));

console.log(`cases: ${cases.size}   scripted: ${scripts.size}   marked SKIP: ${skipped.length}`);

if (problems.length > 0) {
  console.error('\nThe cases and the scripts disagree:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nThe cases are the source of truth. Change the scripts to match them.');
  process.exitCode = 1;
}
