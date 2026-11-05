# e2e-app

End-to-end tests for the reference project, driven in a real browser against a **deployed**
environment. Today that means **dev only** (`*.dev.example.com`).

This is a third repository beside `server-app` and `web-app`.
It is separate on purpose: it tests the two halves *together*, over the network,
as a user reaches them — so it belongs to neither.

## Run it

```bash
cp .env.example .env        # fill in the passwords; .env is gitignored
pnpm install
bash scripts/run-in-container.sh          # the whole suite
bash scripts/run-in-container.sh tests/spike   # just one folder
```

`scripts/run-in-container.sh` runs the tests **inside the Playwright container
image that CodeBuild would use**, not on your laptop's browser. That is the
whole point: a laptop has a display server, a browser profile, a developer's DNS
and no proxy. CodeBuild has none of those, and every "works here, not there"
lives in that gap.

`pnpm test` runs it on the host instead. Useful for `--ui` and debugging; not
what a result is judged on.

Artifacts land in `artifacts/` — JUnit XML, an HTML report, and a trace, video
and screenshot for every failure.

## What exists today: the spike only

`tests/spike/` is a feasibility probe, not coverage. It answers four questions
and nothing else:

| Question | Answer |
|---|---|
| Does Playwright run in a CodeBuild-shaped container? | Yes — 5 tests, 19.5s |
| Can it reach deployed dev over the public distribution? | Yes, both hosts |
| Can a headless container read a disposable-mail inbox? | **Yes** — subjects and message bodies |
| Do the seeded dev credentials still sign in? | Yes, platform and tenant |

Read `docs/spike-report.md` for the findings, including the two defects the
spike turned up on its way through.

## What the suite needs before it can run

Two accounts exist only because the product refuses to shortcut them, and both
are one command in the server repo:

```bash
pnpm seed:agent-login t_acme     # an AGENT who can sign in to /portal/*
```

There is no equivalent shortcut in the product: a portal credential is minted
only at the end of onboarding — maker drafts, checker approves, the agreement is
signed and counter-signed — and that seed performs the same two writes that flow
ends with.

The CHECKER is the other one. Only a `system` user may hold a workspace session
and the seeded hierarchy contains exactly one, so every maker-checker case needs
a second made by hand:

```sql
update users set user_type = 'system' where email = 'checker@example.test';
```
```bash
pnpm local:password t_acme checker@example.test
```

Both are recorded in `cases/journeys/user-lifecycle.md`, where the suite will
eventually create its own rather than borrowing the fixtures'.

## The rules this suite is written under

1. **The browser only ever addresses CloudFront.** Never the ALB, never an ECS
   task. That is a platform invariant, not a test convention.
2. **The subdomain is the tenant.** `acme.dev.example.com` and
   `app.dev.example.com` are one distribution; the Host header selects the
   workspace, and the client never names its own tenant.
3. **No credential is committed.** `.env` locally, Secrets Manager in CodeBuild.
4. **Locate by role, not by label.** `Field` renders a required asterisk inside
   the `<label>`, so label text is `Password*` while the accessible name is
   `Password`; and the eye toggle is labelled "Show password", which a
   substring label match also picks up. `getByRole('textbox', { name: 'Password',
   exact: true })` is the form that survives both.
5. **A test that provisions must deprovision.** Not yet possible — see the
   report.
