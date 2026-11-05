---
paths:
  - 'src/db/**/*.ts'
  - 'src/main.ts'
  - 'src/worker.ts'
---

# Connections — the budget is real arithmetic

Full detail: `docs/multi-tenancy.md`. Connection exhaustion is the most likely
way this platform falls over.

```
(tasks × MAX_LIVE_TENANT_POOLS × pool.max) + (tasks × central.max)
    ≤ pooler max_client_conn
```

- **Never** construct a `Pool`, a `Client`, or call `drizzle()` outside
  `src/db/registry`. Lint-blocked. An ad-hoc pool is invisible to the budget.
- Every tenant has its **own** host, port, database, and credentials, all from
  the central registry. Nothing shared, nothing derived from env config.
- `MAX_LIVE_TENANT_POOLS` is what bounds the whole thing. 5000 tenants means 50
  live pools and eviction churn, not 5000 pools.
- **Always `.end()` an evicted pool.** A dropped pool leaks its socket and its
  server-side backend, and the budget silently shrinks. This is leak surface #1.
- Refuse rather than exceed: `TenantCapacityError` → 503. Growing past the cap
  trades a clear retryable error for a cluster-wide outage.

## Transaction-mode bans (all lint-enforced)

| Banned                        | Use instead                        |
| ----------------------------- | ---------------------------------- |
| `.prepare()` named statements | Plain parameterized queries        |
| `SET foo = ...`               | `SET LOCAL` inside the transaction |
| `LISTEN` / `NOTIFY`           | SQS, or Valkey pub/sub             |
| `pg_advisory_lock()`          | `pg_advisory_xact_lock()`          |
| Temp tables across statements | A CTE                              |

## Memory leaks — the three surfaces

Adding any of these means running `pnpm leakcheck` (budget: RSS <50MB/10min):

1. A pool evicted without `.end()`.
2. A Valkey listener added per request or per job, never removed.
3. An SQS long-poll closure capturing a tenant context that outlives the message.
