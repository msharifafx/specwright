/**
 * Playwright, aimed at a DEPLOYED environment.
 *
 * There is no `webServer` block on purpose: nothing here starts an app. The
 * target is dev on AWS, reached over the public CloudFront distribution, which
 * is the only thing a browser is ever allowed to address (invariant #6).
 *
 * ARTIFACTS ARE THE PRODUCT. A run that passes is a line of output; a run that
 * fails has to explain itself to somebody reading it hours later by email, so
 * the JUnit XML, the HTML report and the traces all land under `artifacts/`
 * and nothing writes outside it.
 */
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const CI = process.env.CI === 'true' || process.env.CODEBUILD_BUILD_ID !== undefined;

/**
 * The browser every project runs in.
 *
 * ONE OBJECT, NOT ELEVEN SPREADS OF `devices['Desktop Chrome']`. A project's
 * own `use` beats the top-level one, so a device spread in each project
 * silently re-pinned the 1280x720 viewport and undid `viewport: null` — the
 * window was maximised and the page sat in a corner of it.
 *
 * `viewport: null` and `--start-maximized` are HEADED-only on purpose: a run
 * whose viewport depends on whichever monitor it happened to be on is not a
 * repeatable run.
 */
const WATCHING = process.env.HEADED === '1';

/**
 * `viewport: null` REMOVES its neighbours rather than overriding them.
 *
 * `devices['Desktop Chrome']` carries `deviceScaleFactor: 1`, and Playwright
 * refuses that with a null viewport — "deviceScaleFactor option is not
 * supported with null viewport" — so the preset has to be taken apart rather
 * than spread over. `screen` goes with it: it describes a viewport that no
 * longer exists.
 */
const { deviceScaleFactor: _dsf, screen: _screen, ...DESKTOP } = devices['Desktop Chrome'];

const BROWSER = WATCHING
  ? { ...DESKTOP, viewport: null }
  : devices['Desktop Chrome'];

export default defineConfig({
  outputDir: 'artifacts/test-results',

  // FOUR WORKERS, and the reason it used to be one is gone.
  //
  // The original note said "parallel workers signing the same fixture user in
  // and out is a source of flake" — true when every test signed in for itself.
  // `fixtures.ts` now signs in ONCE PER WORKER and shares that live context, so
  // four workers are four independent sessions rather than four processes
  // fighting over one.
  //
  // What is still shared is the workspace's DATA, so `fullyParallel` stays off:
  // tests within a file run in order, and the journeys that depend on their own
  // earlier steps declare `serial` explicitly. Files run in parallel with each
  // other, which is where the time is.
  //
  // 280 tests at three seconds each is fourteen minutes in a single file queue.
  // A suite nobody waits for is a suite nobody runs.
  //
  // BEFORE RUNNING PARALLEL AGAINST A SHARED ENVIRONMENT, two things that
  // per-worker accounts do NOT solve, both learned the expensive way:
  //
  //  - WORKSPACE-GLOBAL SETTINGS RACE. A handful of cases turn something on for
  //    the whole workspace and put it back — MFA (CFG-SEC-003), contact
  //    verification (JRN-AGT-027), the ageing thresholds (CFG-REC-002), every
  //    active matching rule (LDR-RE-006). Each restores in a `finally` now, but
  //    a `finally` protects the case that changed it, not the three other
  //    workers signing in or submitting while it is changed. Serially these are
  //    a blip; in parallel they are another worker's inexplicable failure.
  //  - THE EDGE COUNTS PER ADDRESS. Four workers is four times the request rate
  //    from one IP into CloudFront's rate rule, and a block fails everything
  //    until it clears. `submitSignIn` waits one out and `globalSetup` refuses
  //    to start into one, but neither makes the run cheaper to the edge.
  //
  // The workspace must also have been BUILT with as many maker/checker pairs as
  // there are workers — `WORKERS=4 pnpm test` on a workspace built with one
  // now throws by name rather than quietly sharing a pair (see `env.ts`).
  workers: process.env.WORKERS === undefined ? 4 : Number(process.env.WORKERS),
  fullyParallel: false,

  forbidOnly: CI,
  retries: CI ? 1 : 0,
  /**
   * TWO MINUTES, AND THIS IS THE HOOK BUDGET TOO.
   *
   * `test.setTimeout()` in a spec body does NOT reach that spec's `beforeAll`
   * and `afterAll` — they take this value — so every hook in the suite was
   * capped at sixty seconds however generous its file was. A hook that signs
   * in, registers a mailbox over HTTP and fills a five-reference user form does
   * not fit in sixty against a remote environment, and the pass reported
   * `"beforeAll" hook timeout of 60000ms exceeded` followed by the matching
   * `afterAll` — so the user it built was never cleaned up either.
   *
   * The heavy hooks still raise their own with `test.setTimeout` inside the
   * hook, which is the only place that works.
   */
  timeout: 120_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    // CodeBuild renders this as per-test pass/fail in its Reports tab.
    ['junit', { outputFile: 'artifacts/junit.xml' }],
    ['html', { outputFolder: 'artifacts/html-report', open: 'never' }],
  ],

  use: {
    ...BROWSER,
    // WATCHING A RUN. `HEADED=1` opens a real window; `SLOW_MO=300` puts 300ms
    // between actions so a human can follow what it is doing. Both are ignored
    // in the container, which has no display — see `scripts/run-in-container.sh`
    // for the run that a result is judged on.
    // Set ONLY when asked for. Writing `headless: HEADED !== '1'` here looks
    // equivalent and is not: it pins the value in the config, so `--headed` and
    // `--ui` on the command line have nothing to override and the window never
    // opens. Leaving it undefined lets the CLI flag work as documented.
    //
    // AND FILLING THE SCREEN. `devices['Desktop Chrome']` pins a 1280x720
    // viewport, which is right for a repeatable run and wrong for watching one
    // — half the window is grey and wide tables scroll for no reason. Setting
    // `viewport: null` hands the page the whole window, and `--start-maximized`
    // makes the window the whole screen. Both are HEADED-only: a run whose
    // viewport depends on the monitor it happened to be on is not repeatable.
    ...(WATCHING ? { headless: false } : {}),
    launchOptions: {
      slowMo: process.env.SLOW_MO === undefined ? 0 : Number(process.env.SLOW_MO),
      ...(WATCHING ? { args: ['--start-maximized'] } : {}),
    },
    // Everything on failure, nothing on success: traces are large and a green
    // run has nothing to explain.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  /**
   * The edge is asked whether it is answering BEFORE any project runs — see
   * `tests/global-setup.ts`. A run started into a CloudFront rate block is
   * unreadable from its first test, and that has happened twice.
   */
  globalSetup: './tests/global-setup.ts',

  projects: [
    /**
     * THE RUN BUILDS ITS OWN WORKSPACE, and everything else waits for it.
     *
     * The suite is given one credential — the platform super-admin — and makes
     * the rest: a workspace, its masters, and the people it runs as. Nothing is
     * shared with another run and nothing survives this one, so two runs can go
     * at the same time against the same environment without seeing each other.
     */
    {
      name: 'setup',
      testDir: 'tests/setup',
      testMatch: /workspace\.setup\.ts/,
      teardown: 'teardown',
      use: { ...BROWSER },
    },

    // The BOOK: an agent, a rate, and a month of reconciled loan data. Separate
    // from `setup` because it depends on it — the workspace has to exist before
    // anything can be written into it — and because a spec that needs only a
    // screen should not wait for a reconciliation run.
    {
      name: 'domain',
      testDir: 'tests/setup',
      testMatch: /domain\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...BROWSER },
    },

    // ONE STEP OF THE FIXTURE, against whatever the last build left behind.
    //
    // OPT-IN, and it has to be: the comment here used to say "never part of a
    // run: `pnpm test` names the projects it wants" — and nothing enforced it.
    // A bare `playwright test` ran every project, so the probes joined a full
    // run, raced the fixture they were written to debug, and failed it. Now
    // they exist only when asked for.
    //
    //   PROBE=1 npx playwright test --project=probe
    ...(process.env['PROBE'] === '1'
      ? [{ name: 'probe', testDir: 'tests/probe', use: { ...BROWSER } }]
      : []),

    // Runs when everything that depended on `setup` has finished, PASS OR FAIL
    // — a failing run leaks an Aurora database exactly as thoroughly as a
    // passing one.
    {
      name: 'teardown',
      testDir: 'tests/setup',
      testMatch: /.*\.teardown\.ts/,
      use: { ...BROWSER },
    },

    // NO storage state. Sign-in, invitations, password resets and the
    // not-signed-in redirects have to start from a clean context or they are
    // testing nothing.
    {
      name: 'public',
      dependencies: ['domain'],
      testDir: 'tests/public',
      use: { ...BROWSER },
    },

    // No storageState and no setup dependency — `tests/fixtures.ts` signs in
    // once per worker and shares the live context. See its header for why a
    // saved state cannot work against rotating refresh tokens.
    // Journeys span screens and consoles, so they are their own project rather
    // than living under any one console's directory.
    {
      name: 'journeys',
      dependencies: ['domain'],
      testDir: 'tests/journeys',
      use: { ...BROWSER },
    },

    {
      name: 'tenant',
      dependencies: ['domain'],
      testDir: 'tests/tenant',
      use: { ...BROWSER },
    },
    // No storageState and no setup dependency — `tests/fixtures.ts` signs in
    // once per worker and shares the live context. See its header for why a
    // saved state cannot work against rotating refresh tokens.
    {
      name: 'portal',
      dependencies: ['domain'],
      testDir: 'tests/portal',
      use: { ...BROWSER },
    },
    // No storageState and no setup dependency — `tests/fixtures.ts` signs in
    // once per worker and shares the live context. See its header for why a
    // saved state cannot work against rotating refresh tokens.
    {
      name: 'platform',
      dependencies: ['domain'],
      testDir: 'tests/platform',
      use: { ...BROWSER },
    },
  ],
});
