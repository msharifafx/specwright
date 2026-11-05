---
paths:
  - 'src/api/**/*.ts'
  - 'src/features/**/*.ts'
  - 'src/features/**/*.tsx'
---

# Server state

Full detail: `docs/api-client.md`.

- **TanStack Query owns all server state.** No `useEffect` fetching
  (lint-blocked). No server data in Zustand or Context.
- **Every query key starts with the tenant**, built only in
  `src/api/query-keys.ts`. An inline array is how a prefix gets forgotten — and
  a forgotten prefix serves the previous tenant's rows after a switch, which is
  a data leak that presents as a caching oddity.
- Clear the whole query cache on logout and on tenant switch.
- **API types are generated** into `src/api/generated`. Never hand-write a
  request or response type — a hand-written type is a claim about the server
  that nothing verifies.
- Mutations invalidate the keys they affect, scoped to the tenant. Optimistic
  updates only where the rollback is genuinely defined.
- Never retry a 4xx. Use `placeholderData: keepPreviousData` for pagination so
  the table does not collapse to a skeleton on every page change.
- Long work is a **job**: `POST` → `202 { jobId }` → poll. Never hold a request
  open. Surface "queued" as distinct from "running" — a noisy tenant's job can
  legitimately stall.
