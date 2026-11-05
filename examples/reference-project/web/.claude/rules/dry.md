---
paths:
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
---

# DRY — duplicated knowledge, not duplicated text

Every piece of knowledge has **one** authoritative place. If two places must
agree for the UI to be correct, one of them is wrong.

Partly lint-enforced: `sonarjs/no-identical-functions` flags copy-pasted bodies
of five lines or more.

## Where knowledge lives — one owner each

| Knowledge                                   | Owner                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| API request and response types              | `src/api/generated` — generated, never hand-written   |
| Query keys                                  | `src/api/query-keys.ts` — never an inline array       |
| HTTP concerns: auth, correlation id, errors | `src/api/client.ts`                                   |
| File transfer                               | `src/api/files.ts` — nothing else touches S3          |
| User-visible strings                        | `src/i18n/locales/**` — never an inline string        |
| Colours, radii, spacing                     | CSS variables in `src/styles/index.css`               |
| Every UI primitive                          | `src/components/ui` — never a bespoke button or table |
| View state                                  | the URL, via `@/hooks/use-url-state`                  |
| Date and money formatting                   | `src/lib/datetime`                                    |
| Payout rate formatting                      | `src/lib/rate` — never a bare `${rate}%`              |

A hand-written response type, an inline query key, or a one-off bordered div is
the duplication that matters here — and lint cannot see any of it, because the
copies rarely look alike.

## Before extracting

**Rule of three.** Two occurrences are a coincidence; three are a pattern.

**A wrong abstraction costs more than duplication.** A component with eight
boolean props to serve four callers is harder to change than four components.

**Same shape is not same knowledge.** Two components that render similarly but
answer to different requirements must stay separate — merging them means the
next design change to one silently changes the other.

## Composition over configuration

`<Card><CardHead/><CardBody/></Card>` beats `<Card hasHeader hasBody/>`.
When a component grows a boolean prop that switches layout, it is two components.

Missing a primitive? **Add it to `src/components/ui`**, do not build it in a
feature folder. That is how the library grows correctly and how the fifth caller
avoids writing it a fifth time.
