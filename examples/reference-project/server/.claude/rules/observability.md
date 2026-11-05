---
paths:
  - 'src/**/*.ts'
---

# Observability

Full detail: `docs/observability.md`. Budget is ~$5/month; these three rules
cost nothing but are expensive to retrofit.

1. **Plain OpenTelemetry only.** Never emit EMF from application code, and never
   call a CloudWatch SDK to **publish**. Dimension policy lives in
   `otel/collector.yaml`.

   The ban is on the EMIT path, and both of its reasons are about emitting:
   keeping the telemetry backend swappable (an exporter block, not a rewrite),
   and keeping cardinality policy in one reviewable file, which is what the
   $5/month budget hangs on. **Reading** AWS control-plane and alarm state is a
   product feature of the platform-admin Infrastructure screen — there is no
   backend to stay swappable from, because the resources ARE AWS resources, and
   a read creates no dimensions and no cardinality. `DescribeAlarms` is free.
   It is confined to `src/modules/admin/infrastructure/`, and
   `eslint.config.mjs` enforces the confinement rather than leaving it to
   whoever reads this next.
2. **Every log line carries `traceId`** — plus `requestId` and `tenantId`;
   worker logs add `jobKey`, `messageId`, attempt. This is the only thing that
   joins logs to traces.
3. **Trace context propagates through SQS message attributes.** Without it every
   job is an orphan trace and the async half of the system is invisible.

- **`tenantId` is NEVER a metric dimension.** CloudWatch bills $0.30 per unique
  combination — 500 tenants × 10 metrics would be $1,500/month. It goes on the
  span as an indexed attribute and in the log line.
- Structured JSON logs. Never log secrets, tokens, full bodies, or PII — log
  identifiers, not payloads. Log at boundaries, not every step.
