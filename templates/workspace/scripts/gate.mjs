#!/usr/bin/env node
// The PR gate. CI runs EXACTLY this command, so the local result and the CI
// result cannot diverge — a gate that exists only in CI is a gate developers
// meet by being blocked.
//
// Steps come from the [gate] section of .claude/specwright.ini and run in
// order through the platform shell, stopping at the first failure.
//
// Typical steps, cheapest first (references/enforcement.md, references/stacks.md):
//   lint · typecheck · unit tests · contract fresh (regenerate, then
//   `git diff --exit-code`) · migration required · bundle budget ·
//   vulnerability + secrets scan (fixable HIGH/CRITICAL only) · cases check
import { loadConfig } from '../.claude/hooks/lib.mjs';
import { spawnSync } from 'node:child_process';

const cfg = loadConfig();
const steps = cfg.gate.filter((s) => s.cmd);
if (!steps.length) {
  console.error('gate: no steps in the [gate] section of .claude/specwright.ini');
  process.exit(1);
}
for (const { name, cmd } of steps) {
  console.log(`\n--- ${name} ---\n$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: cfg.root, shell: true, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) {
    console.error(`\ngate FAILED at "${name}" (exit ${r.status ?? r.signal}).`);
    process.exit(1);
  }
}
console.log('\ngate passed.');
console.log('Not covered here (run when the feature needs them): database-backed checks,');
console.log('load test, leak probe, end-to-end suite. See the feature workflow doc.');
