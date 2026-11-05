---
paths:
  - 'src/**/*.ts'
  - 'scripts/**/*.ts'
---

# DRY — duplicated knowledge, not duplicated text

Every piece of knowledge has **one** authoritative place in this repo. If two
places must agree for the code to be correct, one of them is wrong.

**Derived data is the exception** — a denormalized column, rollup, or snapshot
duplicates a *value*, not the knowledge. The knowledge is the derivation, and it
still has exactly one owner. Allowed under the conditions in "Derived data" in
`docs/database.md`: one writer, a stated refresh path and staleness bound, and a
recompute-and-compare check. Without those it is not an exception, it is drift.

Partly lint-enforced: `sonarjs/no-identical-functions` flags copy-pasted bodies
of five lines or more.

**A hand-maintained list of things that must match the filesystem is the same
bug in a different shape.** `scripts/emit-openapi.ts` carried an import list of
every controller, and a controller missing from it vanished from the contract
with NO error — surfacing in the web repo as a client method that does not
exist. It now walks `src/` for `*.controller.ts`, sorted so output stays stable
and the staleness gate keeps working.

Before adding a registry, a barrel, or an import list: ask whether it can be
discovered instead. If it genuinely cannot, add a test that asserts the list
covers the filesystem — `test/unit/openapi.spec.ts` is the worked example.

## Where knowledge lives — one owner each

| Knowledge                | Owner                                                         |
| ------------------------ | ------------------------------------------------------------- |
| Environment variables    | `src/config/env.ts` — nothing else reads `process.env`        |
| Pools and db handles     | `src/db/registry` — nothing else constructs one               |
| Cache keys               | `src/cache/keys.ts` — never a template literal at a call site |
| Pagination, cache policy | `src/http/performance.ts` — never hand-rolled limit/offset    |
| Signed S3 requests       | `src/storage/s3.ts`                                           |
| User-visible strings     | `src/i18n/locales/**` — never an inline string                |
| Table shape and indexes  | the schema file — never restated in a migration by hand       |
| Transaction boundaries   | services, via `withTenantTx` — never a repository             |

Adding a second place that knows one of these is the duplication that matters.
It is also the kind lint cannot see, because the two copies rarely look alike.

## Before extracting

**Rule of three.** Two occurrences are a coincidence; three are a pattern. Wait.

**A wrong abstraction costs more than duplication.** Duplication is cheap to
find and cheap to delete. A premature base class is threaded through every
caller and expensive to unpick, and every future case must be bent to fit it.

**Same shape is not same knowledge.** Two functions that look identical but
change for different reasons must stay separate — merging them means the next
change to one silently changes the other. Ask what would make each one change:
different answers mean leave them alone.

## What to reach for instead of a base class

Prefer composition. `withTenantTx`, `timed`, `readThrough`, `paged` are all
functions that wrap behaviour rather than inheritance every domain must adopt.

Specifically **do not** introduce `BaseService` or `BaseRepository`. Every domain
would have to fit a shape defined by the first one written, and repositories
here differ precisely where it matters — the queries.

## Genuine duplication worth removing

- The same query in two repositories → one method, called twice.
- The same validation in a controller and a service → one schema in the DTO.
- The same magic number in two files → one exported constant.
- A copy-pasted job handler differing only in its key → one handler, parameterised.
