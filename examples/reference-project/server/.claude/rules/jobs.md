---
paths:
  - 'src/queue/**/*.ts'
  - 'src/worker.ts'
---

# Background jobs

Full detail: `docs/jobs.md`.

- **Every message carries `MessageGroupId: tenantId`.** That single property is
  the entire fairness mechanism. Omitting it does not error — the message is
  treated as its own tenant and silently loses fair-queue protection.
- One queue per class: `interactive`, `bulk`, `maintenance`. Fair queues solve
  tenant-vs-tenant, not class-vs-class — in a shared queue a tenant's own 40k
  import still blocks that same tenant's "publish now" click.
- **Handlers are idempotent.** SQS standard is at-least-once and Fargate Spot
  interrupts mid-message, so every handler WILL see the same message twice.
  Natural key + `ON CONFLICT DO NOTHING`, or a Valkey idempotency record.
- **Chunk long work into paged messages.** Not for the 12h visibility cap — so a
  retry costs one page instead of the whole import, and so fairness has enough
  units to interleave tenants.
- Parse at the boundary. A message body is JSON, so timestamps arrive as
  **strings**; Drizzle needs a `Date` and fails with `toISOString is not a
function` otherwise.
- Never delete a failed message. It returns via visibility timeout and reaches
  the DLQ through the redrive policy. Never hand-roll a retry loop.
- Payloads over 256KB go to S3; the message carries the key.
- Handle SIGTERM: stop polling, finish in-flight, exit. Spot gives ~2 minutes.
- Workers acquire tenant connections through the **same registry** and count
  against the same budget. 40 worker tasks is 40 more pool-holding processes.
