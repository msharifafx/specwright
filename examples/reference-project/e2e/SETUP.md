# Setting the suite up, from nothing

This is the whole path from a machine that has never run these tests to a green
browser window driving dev. It assumes nothing except that you can install
software on your own machine.

**Windows people: start at [Windows: install WSL first](#windows-install-wsl-first).**
Everything after that section is the same on Ubuntu, WSL and macOS.

**Run it HEADED on your own machine.** There is a whole section on why below,
and it is the one instruction most worth following.

---

## What you are setting up

The suite drives a **real browser** against a **deployed** environment — today
that is dev, `*.dev.example.com`. It is not a unit test suite and there is
no local stack to start.

Every run **builds its own workspace**: it signs in to the platform console as a
super-admin, provisions a fresh tenant, lays down its masters, creates the
people it runs as, and gives the workspace back at the end. That is why setup
takes about ten minutes before the first real test runs, and why you need one
credential to begin with — the platform super-admin.

## Windows: install WSL first

Playwright's browsers and this suite's shell scripts expect Linux. Do not fight
that with Git Bash or PowerShell; install WSL and work inside it.

In **PowerShell as Administrator**:

```powershell
wsl --install -d Ubuntu-22.04
```

Reboot when it asks. On first launch Ubuntu asks for a username and password —
these are local to WSL and unrelated to anything else.

Then, **inside the Ubuntu terminal**, install what Chromium needs:

```bash
sudo apt update
sudo apt install -y curl git unzip
```

Three things that will bite you if nobody says them:

- **Keep the repository inside the Linux filesystem** — `~/work/…`, not
  `/mnt/c/Users/…`. Node on a `/mnt/c` path is slow enough to change how the
  tests behave, and file watching does not work properly across the boundary.
- **A headed run needs a display.** Windows 11 and recent Windows 10 have
  WSLg built in, so `HEADED=1` opens a real window with no extra work. On older
  builds you need an X server (VcXsrv) and `export DISPLAY=:0`. Check with
  `echo $DISPLAY` — empty means no display, and a headed run will fail to launch
  a browser.
- **Run `wsl --update` if the window never appears.** WSLg ships with the WSL
  runtime, not with Ubuntu, so an old runtime is the usual cause.

## Node and pnpm

Node 20 is what this is built and run against.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL -l
nvm install 20
nvm use 20
node -v          # v20.x
```

pnpm comes from Corepack, which ships with Node:

```bash
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm -v          # 10.34.5
```

## The repository

The three repositories are cloned side by side inside a workspace directory. If
you only want to run tests, you only need this one:

```bash
git clone <the e2e repo url> e2e-app
cd e2e-app
pnpm install
pnpm browsers      # downloads Chromium — a few hundred MB, once
```

If `pnpm browsers` complains about missing system libraries, install them:

```bash
npx playwright install-deps chromium
```

## The one file you have to create: `.env`

`.env` is **not** in the repository and never will be — it holds a platform
super-admin password and a deprovision secret. Ask whoever runs dev for the
values; they are the same for everybody on the team.

```bash
cp .env.example .env    # if an example exists; otherwise create it
```

It needs these keys:

| Key | What it is |
|---|---|
| `PLATFORM_EMAIL` | the platform super-admin's sign-in address |
| `PLATFORM_PASSWORD` | their password |
| `DEPROVISION_SECRET` | the shared secret the console asks for before deleting a workspace |
| `KYC_API_KEY` | the PAN/GST/IFSC lookup key, so onboarding cases can verify |
| `KYC_API_KEY` | which the KYC provider environment that key belongs to |

Without `DEPROVISION_SECRET` the run still works, but its **teardown skips** and
your workspace is left behind on dev. That is how the environment ends up with
seventeen abandoned databases, so please set it.

The remaining keys in `.env` — `TENANT_IDENTIFIER`, `AGENT_PASSWORD` and the
rest — are for pointing the suite at an existing workspace instead of building
one. Leave them empty for a normal run.

## Run it

**Headed, on your own machine. This is the instruction.**

```bash
./run-full-headed.sh
```

Or spelled out, if you would rather see what it does:

```bash
set -a && . ./.env && set +a && \
SCHEME=https BASE_DOMAIN=dev.example.com \
PLATFORM_HOST=app.dev.example.com \
WEB_PORT= TENANT_SLUG= MAILPIT_URL= \
HEADED=1 SLOW_MO=250 \
npx playwright test --workers=1 --reporter=line
```

That builds a workspace, runs all 469 cases in a real window, and deletes the
workspace at the end. Budget an hour.

### Why headed, locally

A headless run tells you a case failed. A headed run shows you **why**, and the
difference is not small — it is most of the value of running this locally at
all.

- A dropdown that opens off the bottom of the window, a form five pixels out of
  alignment, an expand button that does nothing: every one of those is invisible
  to a passing assertion and obvious in a window.
- When a case fails, you see the screen it failed on rather than reconstructing
  it from a trace afterwards.
- `SLOW_MO=250` puts a quarter-second between actions so you can follow what the
  suite is doing. Drop it to `SLOW_MO=0` once you have seen enough.

Headless is for CI and for a run you are not watching:

```bash
set -a && . ./.env && set +a && \
SCHEME=https BASE_DOMAIN=dev.example.com \
PLATFORM_HOST=app.dev.example.com \
WEB_PORT= TENANT_SLUG= MAILPIT_URL= \
npx playwright test --workers=1 --reporter=line
```

### Running less than everything

```bash
./run-full-headed.sh --project=journeys       # one project
./run-full-headed.sh --grep "JRN-AGT"         # one family of cases
./run-full-headed.sh --grep "MAS-SP-004"      # one case
```

### Iterating without rebuilding the workspace

Building a workspace takes ten minutes, which is a long time to wait when you
are fixing one case. `REUSE_WORKSPACE=1` keeps the last one and reuses it:

```bash
REUSE_WORKSPACE=1 ./run-full-headed.sh --grep "MAS-SP-004"
```

The catch, and it is worth knowing: a reused workspace already has integrations
configured, a book with history and users in it. Several real bugs only appear
on a workspace built from nothing. **Confirm a fix with a fresh build before you
believe it.**

## Reading the result

```bash
pnpm report        # opens the HTML report
```

Per-case artifacts land in `artifacts/test-results/<case>/`:

| File | What it gives you |
|---|---|
| `test-failed-1.png` | the screen at the moment it failed |
| `error-context.md` | an accessibility snapshot — every heading, button and field |
| `trace.zip` | `npx playwright show-trace <path>` — every action, every request and its status |
| `video.webm` | headed runs only |

The trace is the one that settles arguments. It carries the network log, so
"the screen is broken" and "the request came back 403" look completely different
in it.

## When it goes wrong

**"Sign-in failed" on a correct password.** Almost always CloudFront's rate
rule, not your credentials — the suite is one IP making a great many requests.
The run waits blocks out on its own now, and refuses to start into one. Check
with `curl -o /dev/null -w '%{http_code}\n' https://app.dev.example.com/api/health`;
a 403 there means wait five minutes.

**The browser never opens on WSL.** `echo $DISPLAY`. Empty means no display —
see the WSL section.

**`cases:check` fails after you edit a case.** That is the signal, not an error.
`cases/**/*.md` is the source of truth and `tests/` follows it; the check is
telling you which scripts have not caught up yet.

**A workspace was left behind.** The teardown failed, or `DEPROVISION_SECRET`
was not set. Delete it from the platform console's workspace detail page — the
dialog asks for the slug and that secret.

## What this suite will not tell you

It drives a deployed environment through a browser, so it sees what a user sees
and nothing else. It cannot see a missing tenant scope, an unguarded route, or a
query without its tenant id. Those stay with review and the architectural ESLint
rules in the application repositories.
