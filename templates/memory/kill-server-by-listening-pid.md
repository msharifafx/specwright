---
name: kill-server-by-listening-pid
description: A restarted server still serves old code — the old process is still bound to the port
metadata:
  type: project
---

Killing a dev server by `pgrep -f` matches its shell wrapper, not the process
holding the port, so the stale server keeps answering and every check after a
"restart" tests old code.

**Why:** cost an afternoon of "my fix does not work" on a fix that was correct.

**How to apply:** `ss -ltnp 'sport = :3000'` → pid → confirm `/proc/<pid>/cwd`
is your checkout → kill that pid. Never an unscoped `pkill -f`: it matches
other sessions' processes and can kill your own shell.
