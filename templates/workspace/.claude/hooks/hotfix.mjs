// Stop hook: carry `hotfix:` commits down a branch chain — WITHOUT touching
// any working tree.
//
// INERT unless a git root has .claude/hotfix-chain (most-stable branch first).
// Only commits whose subject starts `hotfix:` / `hotfix(scope):` / `hotfix!:`
// move. Never fetches, pushes or deploys.
//
// HOW IT STAYS OUT OF YOUR WAY. It merges with `git merge-tree --write-tree`
// and moves the branch ref directly, so no checkout ever changes under an
// editor or another session. A branch that IS checked out somewhere is never
// moved behind that checkout's back: the hook stops there and prints the one
// command to run in it. Needs git 2.38+.
//
// Reports through a systemMessage (shown to the person, does not block).
import { git, gitRoots, loadConfig, readStdinJson } from './lib.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const input = await readStdinJson();
if (input.stop_hook_active) process.exit(0);

const HOTFIX = /^hotfix(\([^)]*\))?!?:/;
const report = [];
const cfg = loadConfig();

function checkedOutAt(root, branch) {
  const list = git(root, ['worktree', 'list', '--porcelain']) || '';
  let path = null;
  for (const line of list.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    if (line === `branch refs/heads/${branch}`) return path;
  }
  return null;
}

for (const root of gitRoots(cfg)) {
  const chainFile = join(root, '.claude', 'hotfix-chain');
  if (!existsSync(chainFile)) continue;
  const chain = readFileSync(chainFile, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  for (let i = 0; i < chain.length - 1; i++) {
    const [src, dst] = [chain[i], chain[i + 1]];
    if (!git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${src}`])) continue;
    if (!git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${dst}`])) { report.push(`${dst} does not exist — chain stops at ${src}.`); break; }
    const pending = (git(root, ['log', '--format=%s', `${dst}..${src}`]) || '').split('\n').filter((s) => HOTFIX.test(s) && !s.startsWith('hotfix: propagate '));
    if (!pending.length) continue;
    const where = checkedOutAt(root, dst);
    if (where) {
      report.push(`${dst} is checked out at ${where}, so it was not moved. There, run:\n    git merge --no-ff ${src}\n  carrying: ${pending.join('; ')}`);
      break;
    }
    const mt = spawnSync('git', ['merge-tree', '--write-tree', dst, src], { cwd: root, encoding: 'utf8' });
    if (mt.status === 129 || /usage|unknown option/i.test(mt.stderr)) { report.push('git 2.38+ is needed for hotfix propagation (merge-tree --write-tree).'); break; }
    if (mt.status !== 0) { report.push(`CONFLICT carrying ${src} → ${dst}. Nothing moved from here down. Merge by hand.`); break; }
    const tree = mt.stdout.split('\n')[0].trim();
    const old = git(root, ['rev-parse', `refs/heads/${dst}`]);
    const commit = git(root, ['commit-tree', tree, '-p', old, '-p', `refs/heads/${src}`, '-m', `hotfix: propagate ${src} into ${dst}`]);
    if (!commit || git(root, ['update-ref', `refs/heads/${dst}`, commit, old]) === null) { report.push(`could not move ${dst}.`); break; }
    report.push(`propagated ${src} → ${dst}: ${pending.join('; ')}`);
  }
}

if (report.length) {
  process.stdout.write(JSON.stringify({
    systemMessage: `HOTFIX PROPAGATION (local only, nothing pushed)\n${report.join('\n')}`,
  }));
}
process.exit(0);
