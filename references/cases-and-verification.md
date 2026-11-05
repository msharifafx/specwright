# Cases as specification, and verifying for real

## Contents

1. Cases are the specification
2. The cases check
3. The end-to-end suite and its traps
4. Isolated stacks for test runs
5. Run it yourself
6. Volume, load and leaks
7. Traps that look like passes

---

## 1. Cases are the specification

Cases are plain-English Markdown tables: what a user does, what they must see.
A tester can read and change them without opening a script. Automated tests
are derived from them.

```
| ID | Case | Steps | Expected |
|----|------|-------|----------|
| MAS-CN-004 | A duplicate code is refused | Create a record with a new code. Open the form again and use the same code. | The second save is refused and the reason appears next to the code. The first record is unaffected. |
```

Rules (full text in `templates/e2e/cases/README.md`):

- An ID per case, `AREA-SCREEN-NNN`, never reused. Every test title starts
  with the ID it asserts — the only join between case and script.
- **Behaviour, never mechanism**: no selectors, routes, endpoints, test ids.
- `SKIP` marks a case deliberately not automated yet, with a reason. Do not
  name another case's ID inside the reason: the check reads IDs in text.
- **The loop runs one way.** A person edits a case → the check reports what
  moved → the scripts change, in a commit naming the IDs. **Never edit a case
  to match a script.**
- **The case comes first**, before code. Removing a feature starts by deleting
  its cases; the check then names the scripts to delete.
- A fixed defect the case would not have caught means the case was too weak:
  strengthen it and say what it now catches.
- Cases travel on the **same branch name** as the code in every repo.

## 2. The cases check

`templates/e2e/tools/cases-check.mjs` (Node, no dependencies; reads text, so
it works with any test framework). Configure with `CASES_DIR`, `TESTS_DIR`,
`TEST_EXT`, `CASE_ID`. It reports cases with no script, scripts with no case,
IDs defined twice, and counts SKIPs. It exits non-zero on any difference;
put it in the gate. A failing check after a case edit is the **signal** telling
you which scripts move — not an error to work around.

The reference project holds 1,024 cases in 28 files, split into `screens/`,
`journeys/`, `platform/`, `public/`.

## 3. The end-to-end suite and its traps

- **Judge results in the CI-shaped environment** (a container with the same
  browser image), not on a laptop with a display server, a browser profile
  and developer DNS. `examples/reference-project/e2e/scripts/run-in-container.sh`.
- **Sessions cannot be saved and replayed** when refresh tokens rotate: a
  saved storage state works for one browser context, the second replays a
  revoked token and lands on sign-in. Sign in once per worker and share the
  live context.
- **A second `page.goto` may lose the session**; navigate in-app.
- **Locate by role and accessible name**, not label text: a required asterisk
  inside a label changes its text; a "Show password" toggle matches a
  substring label search.
- **CSS-transformed text**: `allInnerTexts()` returns uppercase for
  `text-transform: uppercase` labels. Match case-insensitively.
- **Re-resolve locators after a re-render**; a stale handle waits forever.
- **Custom controls are not `disabled`**: assert `aria-disabled`.
- **Do not hammer a disposable-mail provider**; it blocks the machine and every
  mail case then fails as if the product sent nothing.
- **A test that provisions must deprovision.**
- **Never sign in with curl as the suite's user mid-run**: it can revoke the
  suite's session and bounce every test to sign-in.

## 4. Isolated stacks for test runs

A local stack shared by several sessions is shared state: one session's worker
long-polls the same queue and eats another's jobs (symptom: a job that "never
runs"); one branch's migration leaves another reporting drift; a poisoned
cache entry outlives the branch that wrote it. None of those look like
contention — they look like flaky tests.

Give each run its own everything with **one project name and one port
offset**, derived in one script so the compose file and the env file cannot
disagree:

```bash
E2E_PROJECT=app-mine E2E_PORT_OFFSET=300 pnpm e2e:up    # containers, migrate, seed
pnpm e2e:verify                                        # prove it serves
docker compose -p app-mine -f docker-compose.e2e.yml down -v   # when done
```

Real implementation: `examples/reference-project/server/scripts/e2e-up.sh` and
`docker-compose.e2e.yml`. Own queues per run, not just own ports.

## 5. Run it yourself

A green gate proves the code compiles and its assertions hold. It cannot see
a dropdown clipped to one option, inputs five pixels shorter than the selects
beside them, or an expand button that does nothing. On the reference project
every visual and functional defect in User Management was found by using it,
and none by a passing test.

- Keep a **one-command local stack** and a **verify script that exercises
  behaviour**, not `ps` output (`examples/.../server/scripts/verify-local.sh`:
  13 checks, including proving the connection pooler really is in
  transaction mode).
- **APIs**: a curl script through happy path, each validation (does the
  message land on the right field?), the conflict, the refusal, the isolation
  boundary. Keep it; paste the output in the PR.
- **Screens**: real browser, every control, resize, keyboard-only pass,
  screenshot beside the design.
- Other system kinds: `stacks.md` § 4.
- **Check you hit what you changed.** With several worktrees the server on the
  usual port may serve another branch: confirm the listening pid's
  `/proc/<pid>/cwd`.
- **Reproduce on a fresh tenant/account**, not only the seeded fixture one:
  fixtures hide provisioning gaps.
- **Local rebuilds from scratch; deployed environments migrate forward.** Some
  bugs (grants, catalogs, environment gates) exist only on the forward path.
  Test there too, through the same URL a user hits.

## 6. Volume, load and leaks

- **Volume**: render lists at production size (10,000 rows), confirm
  pagination/sort/filter are server-side, one request per view change, filters
  debounced.
- **Load, multi-tenant**: a noisy tenant floods while quiet tenants do normal
  work, and every threshold is asserted on the **quiet** ones: p95 < 500 ms,
  errors < 1%, no capacity refusals, no sustained pool waits, no sequential
  scans on big tables. Never point a load test at a route that calls a metered
  third party. `examples/.../server/loadtest/multi-tenant.js`.
- **Leaks**, for anything long-lived: sustained load, two heap snapshots, RSS
  growth < 50 MB over 10 minutes, and flat counts of pools, sockets and
  listeners — steady RSS with a growing socket count is still a leak.
  `examples/.../server/scripts/leak-probe.sh`. Compare against the default
  branch's baseline before blaming yours.
- Things local cannot tell you (e.g. managed-queue fairness) are verified in a
  real environment, and the docs say so.

## 7. Traps that look like passes

- **A check that passes against nothing**: a cache assertion run without the
  CLI installed passes vacuously. Make every new check fail once on purpose.
- **A CDN turning API 404s into 200 HTML** (single-page-app fallback):
  `text/html` from `/api` means the server said 404.
- **A probe that cannot measure has not passed**: load and leak scripts must
  fail, not fall back to `sleep`, when their tool is missing.
- **A migration fan-out that prints success while skipping yours** (a newer
  timestamp from another branch on a shared database). Check the column, not
  the log.
