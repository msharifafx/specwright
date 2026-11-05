# Lessons

Every trap that cost someone real time, written down once so nobody on the
team pays for it twice. `CLAUDE.md` imports this index, so every agent session
for every developer starts with it.

One line per lesson: `- [Title naming the trap](file.md) — the symptom you will see`.
The lesson itself lives in its own file (template: `_template.md`).

<!-- Lessons below. Newest first. Delete a lesson that turns out wrong; a
     wrong lesson is worse than none. Promote one that fires every week into
     a script, a lint rule or a line in CLAUDE.md, then delete it here. -->

- [Kill a dev server by its listening pid](kill-server-by-listening-pid.md) — a "restarted" server still serves old code
