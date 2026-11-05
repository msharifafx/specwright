# Kill a dev server by its listening pid

**Symptom:** after a "restart", your fix does not show — the old server is
still answering on the port.

**Cause:** matching the process by name or command line (`pgrep -f`,
`pkill -f`, Task Manager by name) finds the shell wrapper, not the process
that holds the port. Worse, an unscoped `pkill -f` matches other sessions'
processes and can kill your own shell.

**Do instead:** find the pid that LISTENS on the port, confirm it belongs to
your checkout, kill that pid.
- macOS/Linux: `lsof -nP -iTCP:3000 -sTCP:LISTEN` → pid → `lsof -p <pid> | grep cwd` → `kill <pid>`
- Windows: `netstat -ano | findstr :3000` → pid → `tasklist /fi "pid eq <pid>"` → `taskkill /pid <pid>`

**Why we wrote it down:** an afternoon lost to "my fix does not work" on a fix
that was correct.

**Added:** reference project
