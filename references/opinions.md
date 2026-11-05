# The opinions: what this harness insists on, and why

These are defaults, not suggestions. Each one exists because its absence cost
real time on the projects this harness came from. A project may depart from
one, but only deliberately: write the departure and its reason in the
decision log, so the next person knows it was a choice and not an oversight.

| # | Opinion | Why | May bend when |
|---|---|---|---|
| 1 | **Guardrails before the first feature.** Instructions file, lint hook, Stop hook, gate — day one. | Every later feature runs faster; retrofitting rules onto 200 files means 3,000 violations nobody fixes | Never skipped; may be minimal (one unit, one rule) |
| 2 | **Rules that matter are enforced by tools.** Lint errors, blocked turns, a failing gate. The instructions file holds judgement and reasons, not formatting. | An instruction the agent may forget is a hope | A rule no tool can express stays as an instruction, with its reason |
| 3 | **Requirements are queried, not remembered.** Sources kept untouched; a queryable extract; only stated requirements bind. | A BRD read once is half-remembered by the third sprint | Tiny projects may use a glossary instead of a graph |
| 4 | **Contradictions are hunted, logged and asked — never resolved silently.** | One question before building is cheaper than a rebuild after UAT | Drift between docs and code may be fixed without asking when no behaviour changes |
| 5 | **The design source's markup is the design.** Read the prototype/design for every screen; never build a screen from a field list. | The data comes out right and the screen looks nothing like the design | One-off quirks lose to the shared components; ask about them |
| 6 | **Every feature runs the same loop. No "small change" exemption.** | Skipped steps are invisible until production | Pure copy/label changes get a targeted check instead of the full gate — record that rule once |
| 7 | **A feature is every unit it touches.** API and UI together, in one branch. | Half a feature is reported done and found missing in UAT | Platform work with no UI says so in the PR |
| 8 | **Cases are the specification; scripts follow.** Plain-English cases with IDs; a check fails on drift; a case is never edited to match a script. | Otherwise the automation silently becomes the spec nobody agreed to | Before a tester exists the developer owns the cases — same rules |
| 9 | **Done means used, not green.** curl the API, drive the screen, on the server you actually changed. | Every visual and interaction defect in the reference project was found by using it; none by a test | Never |
| 10 | **Cost decided during the feature.** Indexes, caching, job-vs-request, pagination at production volume. | Fixtures have hundreds of rows; customers have hundreds of thousands | Throwaway prototypes, labelled as such |
| 11 | **Every mistake is written down once.** Memory notes named after the trap; promoted to a rule or script when they recur. | The speed compounds: a day lost once is never lost again | Never |
| 12 | **Decisions and deferrals are written, not chatted.** | A settled question is looked up instead of argued again | Never |
| 13 | **A worktree per feature; people own git and migrations; agents edit files.** | Shared checkouts swallow each other's work; parallel migrations collide | Solo developer, one session: worktrees still recommended |
| 14 | **Each session cleans up what it started**, by listening pid after checking the process is its own; never an unscoped kill. | Leftover stacks exhaust the machine for everyone; `pkill -f` kills other sessions and your own shell | Never |
| 15 | **The local gate equals CI.** One script, run by both. | A gate that exists only in CI is a gate developers meet by being blocked | Slow gates (database, load) are separate named commands, still scripted |
| 16 | **A gate must be clearable.** Scanners report fixable HIGH/CRITICAL only; legacy violations are baselined, new code is strict. | A gate nobody can clear gets switched off | — |
| 17 | **The layout is the project's.** The harness adapts to the directory structure and stack; it never asks for a restructure. | Restructuring to suit a tool is the most expensive way to adopt it | Sibling repos with no common parent: recommend a wrapper directory |
| 18 | **Comments explain why, never what.** Every hook, script and rule carries the failure it prevents. | The why is the part a new team cannot rediscover | — |

## Recording a departure

```markdown
## N. Harness departure: <opinion number and name>

**Status:** decided <date>, by <name>
**What we do instead:** ...
**Why:** ...
**Revisit when:** ...
```
