---
paths:
  - 'src/main.ts'
  - 'src/http/**/*.ts'
  - 'src/modules/**/*.ts'
---

# Speed — checked on every feature

Full detail: `docs/performance.md`. The frontend can only be as fast as the
slowest thing it waits on.

- **Set a cache policy explicitly.** `setCachePolicy(res, 'tenantData' |
'reference' | 'sensitive')`. Never leave it unset — a wrong cache header on
  tenant data is a cross-user leak, which is why there is no default.
- **`timed(res, 'db', ...)` around the expensive step**, so `Server-Timing`
  tells the frontend where the time went. Durations only; no query text, no
  identifiers.
- **Every list endpoint paginates** with `pageParams()` + `paged()`. Never
  hand-roll limit/offset — the helpers enforce the count cap and the depth cap.
- **Independent queries run together.** Rows and count in one `Promise.all`;
  awaiting one then the other doubles page latency.
- **Batch what a screen always needs together** (see `/masters/office-summary`,
  five counts in one round-trip). Two round-trips before first render is the
  difference between fast and sluggish.
- Anything that could exceed a second under real tenant data is a **job**.
- `EXPLAIN (ANALYZE, BUFFERS)` first. No amount of compression rescues a
  sequential scan — this is the one that actually matters.
- **When no index makes it fast, denormalize** — a derived column, a rollup, a
  snapshot. Redundancy is welcome on the read path provided it has one owner and
  a stated refresh path; see "Derived data" in `docs/database.md`. If
  the maintenance cannot be bounded, the work is a job, not a request.
