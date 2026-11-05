# Tiers: how much ceremony a project carries

One level of ceremony for everything gets the method dropped: a load test and
a defect tracker on a weekend script is noise, and a platform without them is
a risk. Specwright has three tiers. The interview asks for one (default
**standard**); it is stored as `tier` in `[project]` of `.claude/specwright.ini`.

## What each tier includes

| | Lite | Standard | Platform |
|---|---|---|---|
| **For** | Prototypes, scripts, small services, internal tools | Products with real users | Many users or tenants sharing infrastructure; regulated or money-moving systems |
| `CLAUDE.md` with invariants, `specwright.ini` | yes | yes | yes |
| Hooks: lint on edit, typecheck on stop, turn-start | yes | yes | yes |
| `node scripts/gate.mjs`, identical to CI | yes | yes | yes |
| Feature worktrees (`feature-start.mjs` / `feature-end.mjs`) | yes | yes | yes |
| Open-questions register + contradiction hunting | yes | yes | yes |
| Team lessons in the repo, imported by `CLAUDE.md` | yes | yes | yes |
| graphify requirements graph | over whatever requirements exist (tickets, notes) | yes | yes |
| Decision log, defect tracker | — | yes | yes |
| Feature workflow doc + PR checklist | — | yes | yes |
| Path-scoped rule files, architecture lint | basic size/boundary rules | yes | yes |
| Cases as the specification + cases check | — | yes, where there is a UI or end-to-end flow | yes |
| `bootstrap.mjs` for a workspace of repos | — | yes | yes |
| Per-session isolated stacks (project name + port offset) | — | — | yes |
| Multi-tenant load test, leak probe | — | — | yes |
| Observability rules (trace ids, bounded metric dimensions, alarms) | — | recommended | yes |
| Hotfix chain (only with branch-per-environment) | — | — | available |

## Choosing

Ask, in plain words:

1. **Who uses it?** Only the team → lite. Real users or a client → standard.
   Many tenants or customers sharing infrastructure → platform.
2. **What happens if it breaks for a day?** Annoying → lite. Users or a client
   notice → standard. Money, data isolation or a contract is at stake →
   platform.
3. **How many people and agents work on it at once?** One or two → lite or
   standard. Several parallel sessions with background workers → platform
   (they need isolated stacks).
4. **Is there a written requirements set?** A BRD/PRD with a prototype pushes
   towards standard at least.

When torn between two, pick the lower one and move up later; moving up is
cheap, and unused ceremony is what gets the method abandoned.

## Moving up a tier

```
node <skill>/scripts/install.mjs <project-root> --tier standard
```

The installer is merge-safe: it adds what the new tier includes, keeps
everything that exists, and saves templates for files you already have as
`*.specwright-new`. Then fill what was added (decision log, workflow doc,
cases), and record the change in the decision log.

## What never varies

Whatever the tier, the agent works inside guardrails from the first feature,
hunts contradictions and asks instead of guessing, runs what it built, writes
every mistake down once in the repo, and passes a gate equal to CI. A tier
changes how much is written down and verified — never whether.
