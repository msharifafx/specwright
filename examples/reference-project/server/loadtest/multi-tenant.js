/* eslint-disable */
// Multi-tenant load test. k6.
//
// A single-tenant load test tells you almost nothing about this system. What
// matters is what happens to EVERYONE ELSE when one tenant misbehaves — so this
// runs a noisy tenant flooding the system while quiet tenants do normal work,
// and every threshold is asserted on the QUIET tenants.
//
//   pnpm local:up && pnpm start:api && pnpm loadtest
//
// NEVER POINT THIS AT A ROUTE THAT CALLS A THIRD PARTY. `/integrations/:cat/test`
// and `/integrations/:cat/send-test` reach a metered vendor with the tenant's own
// credential; the noisy scenario below peaks at 200 req/s for 45s, which is
// thousands of billed calls and a good way to get a key rate-limited or revoked.
// Load goes at routes that read this tenant's own database and stop there.
//
// CANNOT verify queue fairness. No free local SQS double implements fair
// queues; MessageGroupId is accepted and ignored. Fairness is verified against
// real SQS in staging. A green run here says nothing about starvation.
//
// THE NOISY NEIGHBOUR IS A MATCHING RUN, not just a wide page. That is the
// shape this platform's worst case actually has: the run holds a tenant
// connection per chunk while it blocks, scores and moves rows, and it does that
// for as long as the tenant has unreconciled history. A read-only flood cannot
// reproduce it, because a read never takes a row lock or a write connection.
//
// The quiet tenant reads the RECONCILIATION LISTINGS rather than /users, for
// the same reason: those are the screens this feature ships, they are the ones
// competing with the run for the same pool, and a budget met on a small table
// says nothing about the ones the engine is writing to.

import http from 'k6/http';
import { check, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

// Only these two fixtures are seeded with users. `seed-local.ts` leaves
// drivemail, drivepw and mergecheck deliberately empty for empty-state testing,
// and initech has no users either — a tenant nobody can authenticate as cannot
// generate load. So the quiet set is ONE tenant, not the several the noisy/quiet
// framing suggests. Seed another fixture and add it here to widen it.
const QUIET = (__ENV.QUIET_TENANTS || 'globex').split(',');
const NOISY = __ENV.NOISY_TENANT || 'acme';

// Local development only. Every seeded system user shares this; see
// `scripts/seed-credentials.ts`, which refuses to run outside dev for that
// reason. Overridable so this can be pointed at a deployed environment.
const IDENTIFIER = __ENV.LOAD_IDENTIFIER || 'maker@example.test';
const PASSWORD = __ENV.LOAD_PASSWORD || 'Local-Dev-Passw0rd!';

const quietLatency = new Trend('quiet_tenant_latency', true);
const quietErrors = new Rate('quiet_tenant_errors');
const capacityErrors = new Rate('tenant_capacity_errors');

export const options = {
  scenarios: {
    // The victim. Normal, modest traffic — this is what must stay healthy.
    quiet_tenants: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
      exec: 'quietTenant',
    },
    // The noisy neighbour. Ramps into a flood 30s in, so the quiet baseline is
    // measured first and the contrast is visible in the output.
    noisy_tenant: {
      executor: 'ramping-arrival-rate',
      startTime: '30s',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      stages: [
        { target: 200, duration: '30s' },
        { target: 200, duration: '45s' },
        { target: 0, duration: '15s' },
      ],
      exec: 'noisyTenant',
    },
  },

  // Numbers, because "we load tested it" is not a result. These are the
  // thresholds in docs/feature-workflow.md step 7.
  thresholds: {
    quiet_tenant_latency: ['p(95)<500'],
    quiet_tenant_errors: ['rate<0.01'],
    // A 503 from the connection registry means the pool cap was hit. Under a
    // noisy neighbour that must never happen to a quiet tenant.
    tenant_capacity_errors: ['rate==0'],
  },
};

/**
 * One login per tenant, before the clock starts.
 *
 * Every route worth loading is behind a guard, and logging in per iteration
 * would measure argon2 rather than the thing under test — a password hash is
 * deliberately ~70ms, which alone would blow the 500ms budget at 20 req/s.
 * `expiresIn` is 900s against a 2-minute run, so one token lasts.
 */
export function setup() {
  const tokens = {};
  for (const tenant of [...QUIET, NOISY]) {
    const res = http.post(
      `${BASE}/api/auth/login`,
      JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json', 'X-Local-Tenant': tenant } },
    );
    if (res.status !== 200) {
      // Fail loudly here rather than measuring a run where every request 401s
      // and the summary reads as a latency result.
      fail(`login failed for ${tenant}: ${res.status} — is the API up and seeded?`);
    }
    tokens[tenant] = res.json('accessToken');
  }

  // START THE NOISY TENANT'S RUN before the clock, so the worker is already
  // chewing through chunks when the quiet tenant's baseline is measured. A 409
  // means one is already in flight, which is just as good a noisy neighbour —
  // both are the condition this test exists to measure the quiet tenant under.
  const started = http.post(
    `${BASE}/api/loan-data/matching-runs`,
    JSON.stringify({ mode: 'full' }),
    {
      headers: {
        'X-Local-Tenant': NOISY,
        Authorization: `Bearer ${tokens[NOISY]}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (started.status !== 201 && started.status !== 200 && started.status !== 409) {
    fail(`could not start a matching run for ${NOISY}: ${started.status} — is the worker up?`);
  }

  return { tokens };
}

function headersFor(tenant, tokens) {
  return {
    // Local only. Real tenant identity comes from subdomain + verified JWT
    // claim — see docs/multi-tenancy.md. Never accept a tenant header in a
    // deployed environment.
    'X-Local-Tenant': tenant,
    Authorization: `Bearer ${tokens[tenant]}`,
    'Content-Type': 'application/json',
  };
}

// The three reconciliation listings, round-robined — a real reconciler moves
// between them rather than refreshing one.
const QUIET_PATHS = [
  '/api/loan-data/matched?pageSize=50',
  '/api/loan-data/unmatched?side=agent&pageSize=50',
  '/api/loan-data/suspense?side=agent&pageSize=50',
  // The cost sheet's jobs panel POLLS this every 2s for as long as a generation
  // is running, from every screen that has one open. That is a standing read
  // this platform did not have before, so it belongs in the quiet mix rather
  // than being assumed cheap because it is small.
  '/api/payout/cost-sheets/runs',
];

export function quietTenant(data) {
  const tenant = QUIET[Math.floor(Math.random() * QUIET.length)];
  const path = QUIET_PATHS[Math.floor(Math.random() * QUIET_PATHS.length)];
  const res = http.get(`${BASE}${path}`, {
    headers: headersFor(tenant, data.tokens),
  });

  quietLatency.add(res.timings.duration);
  quietErrors.add(res.status >= 400);
  capacityErrors.add(res.status === 503);

  check(res, {
    'quiet tenant served': (r) => r.status === 200,
    'quiet tenant not starved': (r) => r.timings.duration < 500,
  });
}

export function noisyTenant(data) {
  // ON TOP OF the run started in setup(). The run is the write pressure — chunks
  // taking row locks and moving rows out of the hot tables — and this is the read
  // pressure the same tenant's users would add while it happened. Together they
  // are what the quiet tenant has to survive.
  //
  // It reads this tenant's own database and calls nothing external; see header.
  http.get(`${BASE}/api/loan-data/matched?pageSize=200`, {
    headers: headersFor(NOISY, data.tokens),
  });
}

/**
 * Print the numbers a failure has to be diagnosed from.
 *
 * Returning a `stdout` key REPLACES k6's default summary rather than adding to
 * it, so anything not named here is invisible. The first version of this printed
 * p95 alone — which meant a run that blew the budget gave no way to tell a pool
 * exhaustion (503s) from a saturated event loop (no errors, just slow) without
 * running it again. Every threshold metric is reported, pass or fail.
 */
export function handleSummary(data) {
  const t = data.metrics.quiet_tenant_latency?.values ?? {};
  const pct = (m) => `${((data.metrics[m]?.values?.rate ?? 0) * 100).toFixed(2)}%`;
  const ms = (v) => (typeof v === 'number' ? `${v.toFixed(0)}ms` : 'n/a');
  const verdict = (t['p(95)'] ?? Infinity) < 500 ? 'PASS' : 'FAIL';

  return {
    stdout:
      `\nQuiet tenant under a noisy neighbour — ${verdict}\n` +
      `  latency   avg ${ms(t.avg)}  p95 ${ms(t['p(95)'])} (budget 500ms)  p99 ${ms(t['p(99)'])}  max ${ms(t.max)}\n` +
      `  errors    ${pct('quiet_tenant_errors')} (budget <1%)\n` +
      `  503s      ${pct('tenant_capacity_errors')} (budget 0% — a 503 is the pool cap)\n` +
      `  requests  ${data.metrics.http_reqs?.values?.count ?? 0} total, ` +
      `${(data.metrics.dropped_iterations?.values?.count ?? 0)} iterations dropped\n` +
      `NOTE: queue fairness is NOT covered here. Verify in staging against real SQS.\n` +
      `      The noisy tenant ran a FULL matching run throughout; a green result\n` +
      `      means the quiet tenant survived write pressure, not just reads.\n\n`,
  };
}
