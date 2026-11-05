# Feature workflow

**Every feature follows this. No "small change" exemption.**

A feature covers **frontend and backend together**. A UI built against an unbuilt endpoint is half a feature. Coordinate with the matching work in `server-app` — the two land together or the feature is not done.

---

## 0. Worktree

```bash
git worktree add ../app-web-feat-<name> -b feat/<name>
cd ../app-web-feat-<name>
pnpm install --frozen-lockfile     # <- STEP ZERO. Not optional.
```

`node_modules` is gitignored, so a fresh worktree has none. Without this install the lint hook reports "NOT linted" on every edit and `pnpm gate` fails. pnpm's store makes it cost about **1.2 seconds**.

Cleanup: `git worktree remove ../app-web-feat-<name>`.

**Feature spans both repos?** That is the normal case, and it needs a worktree in
each. Use the workspace helper instead:

```bash
cd <workspace-root> && ./scripts/feature-start.sh <name>
cd ../app-feat-<name> && claude
```

### Running backend

There is no compose file in this repo. The API and its dependencies run from the
server repo:

```bash
cd ../server-app && pnpm local:up && pnpm local:verify
```

The dev server proxies to `http://localhost:3000`. Override with
`API_ORIGIN=http://localhost:3111 pnpm dev` when running a feature branch's API
beside the main one. Fixture tenants are `acme`, `globex`, `initech` — develop
against more than one, or tenant-scoping bugs stay invisible.

**Reproduce a reported UI bug against a fresh reload before changing code.** A
long-lived dev session serves a stale bundle after a router or hook change, and
the symptom — view state that will not update — looks exactly like a state bug.
Confirm it survives a hard reload first; a bug you cannot reproduce is one you
will "fix" by breaking working code.

## 1. Understand before editing

```
/graphify query "what renders <the component you are about to change>"
```

Enumerate consumers before changing a shared component. The most common regression here is a prop change that silently alters a screen nobody opened during review.

## 2. Contract first

Regenerate the API client **before** writing the feature:

```bash
pnpm api:generate
```

Never hand-write a request or response type. If the endpoint does not exist yet, land the server change first or agree on the OpenAPI shape — building against a guessed contract produces a UI that compiles and does not work.

## 3. Build

To the rules in `CLAUDE.md`. While building:

- TanStack Query for all server state. No `useEffect` fetching.
- Every query key starts with the tenant id.
- Tables server-paginated, sorted, filtered — always.
- All four states designed: loading (skeleton), empty (distinguish "no data" from "no results"), error, partial.
- Dates through `src/lib/datetime` with the **tenant's** timezone.
- File size is lint-enforced: 250 lines per module, **150 per component**, 50 per function. A 150-line component is usually three components.

## 4. Style guide

`STYLE_GUIDE.md` governs. **Until it is written, the ESLint and Prettier configs are the style guide.**

## 5. Lint — non-negotiable

```bash
pnpm gate     # runs scripts/gate.sh — the exact script buildspec.yml runs
```

Never `eslint-disable` a rule from the CLAUDE.md hard-rules section. Change the rule and the doc together, or do not change it.

## 6. Unit tests with mocks

- **Mock**: the network, via MSW handlers built from the **generated** types — so a contract change breaks the test rather than passing against a fiction.
- **Do not mock**: your own components, or TanStack Query itself.

Query by role and label, the way a user finds things. Never by test id unless there is no accessible handle — and treat that as a bug in the component.

Every feature adds: happy path, the error state a user will actually hit, and keyboard operation of anything interactive.

## 6b. LOOK at the screen before calling it done

A green `pnpm gate` proves the code compiles and its assertions hold. It cannot
see that a dropdown renders as a one-option sliver, that inputs are five pixels
shorter than the selects beside them, or that expanding a tree node does
nothing. Every visual and interaction defect in this feature was found this way
and none of them by a test.

Run the app, drive the screen, and READ THE SCREENSHOT:

```bash
API_ORIGIN=http://localhost:3100 PORT=5273 pnpm dev   # point at your worktree's API
```

Then drive it headlessly — see `/run` for the pattern. Check, at minimum: the
happy path end to end, one keyboard-only pass, and a screenshot compared
against the prototype side by side.

### Locator traps that will cost you an hour

- **`allInnerTexts()` returns CSS-TRANSFORMED text.** Labels styled
  `text-transform: uppercase` come back uppercase while the DOM holds
  title-case, so `hasText: 'REGIONAL OFFICE'` never matches. Match
  case-insensitively.
- **Locate a control through its label's `for` attribute**, not by index. This
  codebase's forms add and remove fields as the user type changes — which is
  exactly the behaviour under test — so any index is a moving target.
- **Re-resolve a locator after the DOM changes.** A handle captured before a
  remount waits forever on an element that was replaced.
- **A custom control is not `disabled`.** `Combobox`'s trigger is a div (so each
  chip can carry a real remove button), so assert `aria-disabled`, not
  `toBeDisabled()`.
- **jsdom implements neither `scrollIntoView` nor `IntersectionObserver`.** Both
  are stubbed in `src/test/setup.ts` — stub there, never guard in the component,
  or test scaffolding leaks into production code.

## 7. Performance check — real data volume

Tenant tables reach hundreds of thousands of rows. Local fixtures have hundreds, so the bug does not appear until a customer sees it.

- Confirm pagination, sorting, and filtering are **server-side**. A `getPaginationRowModel` over a client-fetched array is fine in a demo and catastrophic in production.
- Render a table with 10,000 fixture rows and confirm virtualization holds.
- Check the network panel: one request per view change, not one per keystroke — filters debounce at 300ms.
- Confirm column definitions are memoized. Redefining them each render defeats TanStack Table's memoization and is the usual cause of a table that feels slow for no visible reason.

Backend query load testing is the server repo's job (`server-app/docs/feature-workflow.md` step 7), but a feature spanning both is not done until that side passes too.

## 7b. Speed — every feature, not occasionally

A feature is not done until it is fast. Check all of these:

- **Route is lazy-loaded.** New feature = new `lazy()` chunk, never added to the
  entry bundle. `pnpm gate` enforces entry ≤250KB and any route chunk ≤150KB.
- **No waterfall.** Independent queries run together (`useQueries`), never one
  awaiting another. A waterfall spends a full round-trip on nothing.
- **Prefetch on intent** for anything reachable by a click — spread
  `prefetchProps(qc, key, fetcher)` onto the link or row.
- **Server-Timing** in the devtools network panel: is the cost server-side or
  network? Attribute before optimising.
- **304s on a repeat load**, not full bodies.
- **One request per view change**, not one per keystroke.
- Long lists virtualized; pagination server-side.

If the API is the bottleneck, fix it in the API — a slow endpoint cannot be
made fast on the client. See `server-app/docs/performance.md`.

## 8. Bundle budget

```bash
pnpm build
```

Entry bundle stays under **250KB gzipped**. A new heavy dependency (chart library, editor, date library) is lazy-loaded at the route, not added to the entry.

## 9. Regression sweep

- `/graphify query "what uses <changed component>"` — confirm every consumer still holds.
- Run the full test suite, not just the new tests.
- Confirm no `dark:` variant crept in — the app is single-theme (`docs/ui.md`).
- Verify the tenant-switch path still clears the query cache; a stale cache across tenants presents as a caching oddity and is a data leak.

## 9c. The cases — write down what the product now DOES

**Before you finish, ask what a user would notice.** A new screen, a changed
refusal, a field that stopped being editable, a control that no longer exists —
each of those is a CASE, and cases live in `e2e-app/cases/`.

**The cases are the specification. The scripts follow them, never the reverse.**
That direction is the whole point of the arrangement: `cases/**/*.md` are English
tables a tester can read and change without opening a script, and
`pnpm cases:check` fails the moment the two disagree. Write the case FIRST — even
for behaviour that is not automated yet — and the gap becomes visible instead of
imaginary.

What to do, by what you did:

| You | The cases |
|---|---|
| Added behaviour | Add a case. It can be scripted later; written down, it is not forgotten. |
| Changed behaviour | Edit the Expected column of the cases it touches. |
| Removed a feature | DELETE its cases first, then the scripts follow — see `feat/remove-re-registration`, which dropped `MAS-RR-001..005` in `cases/` and the scripts in the same commit. |
| Fixed a defect | If the case would not have caught it, the case was too weak. Strengthen it, and say in the commit what it now catches. |

**A case describes BEHAVIOUR, never mechanism.** No selectors, no routes, no
endpoint paths, no test ids — those change without the product changing, and a
case that names one is a case that goes stale on a refactor. "Refused, saying
which way round the dates go" is a case. "`PUT /masters/standard-payouts` returns
400" is not.

**Use the same branch name in the e2e repo.** All three repositories carry
`feat/<name>`, so the case change travels with the code change and whoever picks
up the script work has a diff to read rather than a product to re-derive.

```bash
cd ../e2e-app
git checkout -b feat/<name>          # the same name as the other two repos
$EDITOR cases/screens/<area>.md      # or cases/journeys/<area>.md
pnpm cases:check                     # names every case with no script, and the reverse
```

`cases:check` failing after a case edit is CORRECT and is the signal, not an
error to code around: it is telling you which scripts now have to move. Adjusting
them is the next piece of work, and it is a piece of work somebody can pick up
from the diff alone.

## 10. Finish

```bash
pnpm gate
/graphify . --update
git worktree remove ../app-web-feat-<name>
```

---

## PR checklist

```
- [ ] Frontend and backend both covered (link the server PR)
- [ ] Worktree used; `pnpm install` run in it
- [ ] API client regenerated, not hand-written
- [ ] Tables server-paginated/sorted/filtered
- [ ] All four states: loading, empty, error, partial
- [ ] Keyboard operable; jsx-a11y clean
- [ ] No `dark:` variants — the app is single-theme
- [ ] Checked against the prototype's markup, not just its CSS
- [ ] No bare `text-xs`/`text-sm` — sizes carry an explicit `/[1.45]`
- [ ] Tenant id in every query key; cache cleared on tenant switch
- [ ] Screens driven in a browser and the screenshot compared against the prototype
- [ ] pnpm gate passes
- [ ] Tests incl. error path and keyboard operation
- [ ] Bundle under 250KB gzipped; new route is its own lazy chunk
- [ ] No request waterfall; prefetch-on-intent where a click leads somewhere
- [ ] Server-Timing checked; 304s on repeat load
- [ ] Errors report to /client-errors with X-Trace-Id; no PII in the report
- [ ] Consumers enumerated via graphify; no regression
- [ ] Files within size limits (250 / 150 component / 50 function)
- [ ] Cases added or updated in `e2e-app/cases/` for any behaviour a user would notice; `pnpm cases:check` run and its output understood
- [ ] Graph updated
```
