#!/usr/bin/env node
/**
 * Keep the written cases and the automated tests from drifting apart.
 *
 * The cases are the source of truth, so the failure this guards against is
 * not "a test is missing" but "somebody changed the truth and nobody changed
 * the scripts". Both directions are reported: a script with no case is
 * behaviour nobody agreed to test, and no tester can review it.
 *
 * The join is the ID. A script claims a case by putting the ID in its test
 * title:   test('MAS-CN-004 · a duplicate code is refused', ...)
 *
 * Framework-agnostic: it only reads text, so it works for Playwright, Cypress,
 * pytest, JUnit, XCTest, Espresso... Configure with env vars:
 *   CASES_DIR   (default: cases)          where the Markdown cases live
 *   TESTS_DIR   (default: tests)          where the scripts live
 *   TEST_EXT    (default: spec|test|ts|js|py|kt|swift|java|go)
 *   CASE_ID     (default: [A-Z]{3}-[A-Z0-9]{2,6}-\d{3}[a-z]?)
 *
 * Exits non-zero on any difference. Put it in the gate.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CASES_DIR = process.env.CASES_DIR ?? 'cases';
const TESTS_DIR = process.env.TESTS_DIR ?? 'tests';
const TEST_EXT = new RegExp(`\\.(${process.env.TEST_EXT ?? 'spec|test|ts|js|py|kt|swift|java|go'})$`);
const ID_SRC = process.env.CASE_ID ?? '[A-Z]{3}-[A-Z0-9]{2,6}-\\d{3}[a-z]?';
const ID = new RegExp(`\\b(${ID_SRC})\\b`, 'g');

function walk(dir, match) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
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
      // By FILE, not by occurrence: an ID may appear twice in one document —
      // in its row and in a note — and that is not a duplicate definition.
      const seen = found.get(id) ?? new Set();
      seen.add(file);
      found.set(id, seen);
    }
  }
  return new Map([...found].map(([id, files]) => [id, [...files]]));
}

// A case is DEFINED by the table row that starts with its ID. Other mentions
// (a note, a SKIP reason naming another case) are references, not definitions.
const definingRow = (id, file) => {
  const row = new RegExp(`^\\|\\s*${id}(\\s+SKIP)?\\s*\\|`);
  return readFileSync(file, 'utf8').split('\n').find((l) => row.test(l)) ?? '';
};
const caseFiles = walk(CASES_DIR, /\.md$/).filter((f) => !f.endsWith('README.md'));
const mentioned = idsIn(caseFiles);
const cases = new Map(
  [...mentioned]
    .map(([id, files]) => [id, files.filter((f) => definingRow(id, f))])
    .filter(([, files]) => files.length > 0),
);
const scripts = idsIn(walk(TESTS_DIR, TEST_EXT));

// SKIP is a decision, not a gap: written down, with a reason, not automated yet.
const isSkipped = (id, file) => /\bSKIP\b/.test(definingRow(id, file));

const problems = [];
for (const [id, files] of cases) {
  if (files.length > 1) problems.push(`${id} is defined in more than one case file: ${files.join(', ')}`);
  if (!scripts.has(id) && !isSkipped(id, files[0])) {
    problems.push(`${id} has no script. Script it, or mark it SKIP with a reason.`);
  }
}
for (const [id] of scripts) {
  if (!cases.has(id)) problems.push(`${id} is asserted by a script but defined in no case file.`);
}

const skipped = [...cases.keys()].filter((id) => isSkipped(id, cases.get(id)[0]));
console.log(`cases: ${cases.size}   scripted: ${scripts.size}   marked SKIP: ${skipped.length}`);

if (problems.length > 0) {
  console.error('\nThe cases and the scripts disagree:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nThe cases are the source of truth. Change the scripts to match them —');
  console.error('never edit a case to match a script; a person decides what a case says.');
  process.exitCode = 1;
}
