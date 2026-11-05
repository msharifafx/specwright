// UserPromptSubmit hook: remember where every git root's HEAD was when the
// turn began, so the Stop hook can also check work the agent COMMITTED during
// the turn — not only what is still uncommitted. Writes nothing to git;
// state lives in .claude/.specwright/ (self-ignoring).
import { STATE_DIR, git, gitRoots, loadConfig } from './lib.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cfg = loadConfig();
const heads = {};
for (const root of gitRoots(cfg)) {
  const h = git(root, ['rev-parse', 'HEAD']);
  if (h) heads[root] = h;
}
mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(join(STATE_DIR, '.gitignore'), '*\n');
writeFileSync(join(STATE_DIR, 'turn-start.json'), JSON.stringify({ at: new Date().toISOString(), heads }, null, 2));
process.exit(0);
