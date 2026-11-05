# From requirements to production: the Specwright cookbook

For people, not agents: the method behind Specwright, in ten recipes. Hand
this to a team adopting it.

## Where it comes from

Specwright was extracted from a production multi-tenant platform — an API and
workers, a web app, a database per tenant, queues, cloud infrastructure, with
dev, uat and prod environments — and a fork of it built for a second client.
What made delivery fast was not typing speed. It was treating the coding
agent as a team to be governed, not a faster keyboard.

The habits, one recipe each:

1. Guardrails exist before the first feature does.
2. Requirements live in a graph you can query, not a PDF read once.
3. Contradictions are hunted and asked about, never resolved silently.
4. The design source's markup is the design.
5. Rules that matter are enforced by tools, not by asking nicely.
6. Every feature runs the same loop.
7. Plain-English cases are the specification; scripts follow.
8. Done means used, not green.
9. Every mistake is written down once, in the repo.
10. Decisions, defects and parallel sessions are managed deliberately.

How much of this a project carries depends on its tier — lite, standard or
platform (`tiers.md`). Recipes 1, 3, 5, 8 and 9 apply to every tier.

---

## Recipe 1 — Day zero: guardrails first

On the fork's first day the commits were a cost estimate, an architecture
diagram, path-scoped rules and a typecheck hook. Not one screen. Every later
feature ran faster for it.

**Do:** describe the project as units in `.claude/specwright.ini` (any
layout, any stack), write the top-level instructions file in an hour (what
the product is, the units, the invariants, how to run it, where requirements
live), wire the lint and Stop hooks, make the gate one command identical to
CI (`node scripts/gate.mjs`), and start every feature with
`node scripts/feature-start.mjs <name>`. Write how the system will be shaped
— data, isolation, queues, environments, cost — as short topic docs.

**Goes wrong when:** the instructions file becomes an essay (the agent reads
it every session), or hooks are put in a subfolder's settings file that is
never loaded.

## Recipe 2 — Requirements you can query

Keep every source untouched. Build a graphify knowledge graph from them
(`/graphify <requirements_dir>`) whose relationships are tagged extracted /
inferred / ambiguous. Only extracted ones bind. Ask it at the start of every
feature: `/graphify query "what feeds the Cost Sheet"`.

On the reference project the Cost Sheet's topic page showed every input and
approval connected to it — which is how it turned out to be a *sequence* of
sheets rather than one, a fact no single paragraph stated.

**Goes wrong when:** inferred links are treated as requirements, or the graph
is asked about design. Write down once what the requirements do not know —
"the BRDs are single-tenant; every requirement is still built tenant-scoped".

## Recipe 3 — Hunt contradictions, then ask

Compare every pair: requirement vs requirement, vs design, vs later emails, vs
invariants, vs existing behaviour; docs vs code; config vs practice;
instruction file vs instruction file. Each finding goes into the
open-questions register, both sides quoted exactly, with options and a
recommendation. Ask the blocking ones together; build the parts they do not
touch.

Example: the permission catalog said "Disbursement by bank", the prototype
drew "mix by product". One key cannot mean both. One question to the client,
not a guess in code.

**Goes wrong when:** an agent "resolves" a contradiction by picking the side
that is easier to build. That is a decision nobody made.

## Recipe 4 — The design is the markup

For each screen, open the prototype's HTML/CSS: fields in order, labels as
written, mandatory markers, the control for each field, empty states, buttons.
Build to the shared components; one-off quirks lose to them.

User Management was first built from a field list: right data, wrong screen,
rebuilt. The prototype-fidelity rule was written so the next screen started
from the markup.

## Recipe 5 — Guardrails the agent cannot skip

Structure as lint errors (boundaries, one door for dangerous handles, no
cycles, ~300-line files, ~50-line functions, narrow DRY). A hook that lints
each file the moment it is written and puts the findings in front of the
agent. A Stop hook that refuses to end a turn while typecheck fails —
including for work the agent committed during the turn. Path-scoped rule
files that load with the code they govern: connections, database, jobs,
observability, performance, components, data fetching, prototype fidelity.

The hooks are plain Node, so they behave the same on Windows, macOS and
Linux.

**Goes wrong when:** a hook fails for the wrong reason (it cannot find the
toolchain — run the command yourself first), a unit command only works in one
shell, or a limit is raised to get unstuck instead of splitting the file.

## Recipe 6 — The feature loop, every time

Worktree → clarify (requirements, design, decisions, contradictions, ask) →
callers enumerated → case first → data access and cost → every unit it
touches → tests → gate → run it yourself → volume/load/leak where the tier
calls for it → record lessons and deferrals → clean up. No "small change"
exemption: a fix that matches a defect's wording but misses the requirement
comes back reopened.

## Recipe 7 — Cases are the specification

Markdown tables with IDs, behaviour never mechanism. A check fails when cases
and scripts drift; scripts change to match cases, never the reverse.

`MAS-CN-004 · A duplicate code is refused · Create a record with a new code.
Open the form again and use the same code. · The second save is refused and
the reason appears next to the code.`

The suite found what no unit test could: a checker had to type a rejection
reason that the maker was never shown, so makers resubmitted unchanged.

## Recipe 8 — Done means used

curl the API through every path; use the screen in a real browser; compare
with the design. Check the server you hit is the one you changed. Every
functional and visual defect in User Management was found this way; none by
a passing test. Beware passes that test nothing: a check run without its CLI,
a CDN turning a 404 into a 200 page.

## Recipe 9 — Every mistake paid for once, by the whole team

When something costs an hour, write a lesson in the repo (`docs/lessons/`),
named after the trap, with symptom, cause and fix, and add one line to
`INDEX.md`. `CLAUDE.md` imports the index, so every developer's agent starts
every session knowing it. A lesson that keeps firing becomes a script or a
rule. Personal Claude memory is for personal preferences, not for team
knowledge.

## Recipe 10 — Decisions, defects, parallel sessions

A decision log so settled questions are looked up, not re-argued. A defect
CSV whose "how verified" column must be filled. Parallel agent sessions in
their own worktrees and, on platform-tier projects, their own stacks; people
own commits, merges and migrations; stage by path; every session stops what
it started.

---

## What it costs

- A slower first week; the return starts in week two.
- Review stays human. Unreviewed speed comes back as a batch of defects.
- Discipline is the whole trick. Skip a step "just this once" and it quietly
  stops working.
- Parallel sessions collide until the rules in Recipe 10 are followed.

## One week to adopt it

| Day | Do | Done when |
|---|---|---|
| 1 | Install graphify; `/specwright` discovery and interview; choose the tier; `CLAUDE.md` and `specwright.ini` | A fresh session can say what the product is and name its invariants |
| 2 | Hooks and the `[gate]` steps | A rule-breaking edit is caught in the same step; `node scripts/gate.mjs` passes and CI runs it |
| 3 | Requirements graph; contradiction pass; questions asked | Open questions are logged with recommendations |
| 4 | Cases for one screen, the check in the gate (standard tier and up) | Deleting a script fails the check |
| 5 | One real feature through the full loop; first team lessons | It was used in a browser, and the lessons index has its first entries |
