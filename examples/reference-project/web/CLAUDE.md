# Reference project — Web

React front end for a multi-tenant SaaS channel-operations platform. The backend is `server-app` (NestJS, database per tenant, on AWS).

This file is the contract for every session in this repo. The rules below exist because this UI runs against **per-tenant databases that can be large** and a **tenant boundary that must never be client-controlled**.

## Before you start

```
/graphify query "how does the tenant context reach a data table"
/graphify . --update    # refresh when stale (>7 days or after a large merge)
```

## Stack

| Layer        | Choice                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Build        | Vite, React 19, TypeScript strict                                                                    |
| UI           | **In-repo component library** (`@/components/ui`) on Tailwind, extracted from the the client product prototype |
| Server state | **TanStack Query**                                                                                   |
| Tables       | Hand-written `<Table>/<Th>/<Td>/<Tr>` from `src/components/ui`, server-side pagination                |
| Forms        | Plain `useState` drafts — no react-hook-form, no client-side zod                                      |
| Routing      | React Router                                                                                         |
| Client state | Zustand, UI-only                                                                                     |
| API client   | **generated** from `openapi.json`                                                                    |

---

## Hard rules

### Tenant boundary — `docs/architecture.md`

1. Tenant context comes from the **subdomain plus the JWT claim**, resolved once at app boot. Never from `localStorage`, a query parameter, a form field, or anything else a user can edit. Lint-enforced. The platform host `app.` has **no tenant** — a distinct state, not a null tenant that reads as "still loading" (`docs/architecture.md`).
1b. **The API base URL is the relative path `/api`.** The SPA and API are same-origin behind one CloudFront distribution, so no host is ever constructed, and nothing is baked into the bundle. Locally, the Vite proxy reproduces this — develop on `acme.localhost:5173`, never bare `localhost`.
2. The client never sends a tenant id to select a tenant. The server derives it from the token. A tenant id in a request body is a bug, not a convenience.
3. Every TanStack Query key starts with the tenant id: `['t', tenantId, 'orders', filters]`. Without it, switching tenants serves the previous tenant's cached data — a data leak that looks like a caching bug.
4. Clear the whole query cache on logout and on tenant switch.

### Server state — `docs/api-client.md`

5. **TanStack Query owns all server state.** No `useEffect` fetching — lint-enforced. No server data in Zustand or Context.
6. **API types are generated** from the server's `openapi.json` into `src/api/generated`. Never hand-write a request or response type: a hand-written type is a claim about the server that nothing verifies. CI fails if the generated output is stale.
7. Mutations invalidate the query keys they affect. Optimistic updates only where a rollback is genuinely defined.
8. Every request carries a correlation id and surfaces the server's error `code` — not its raw message.

### Data volume — `docs/conventions.md`

9. **Every table is paginated server-side via `Pager`** — items per page, Prev, numbered pages, Next. `page` and `pageSize` live in the URL through `usePagination`, so a filtered page is shareable and the back button works. Query hooks return the **whole paged envelope**, not just `.data`. Changing a filter or tab resets to page 1. `totalIsCapped` renders as "10,000+" — never present a capped total as exact. No client-side slicing, ever.
10. Debounce filter input (300ms) and pass the query as a key so results are cached rather than refetched.
11. Long-running work (imports, exports, bulk updates) is a **job**, not a request. Start it, get an id, poll or subscribe for progress. Never hold a request open.
12. Virtualize any list that can exceed ~200 rows.

### UI — `docs/ui.md`

13. **Every UI surface is built from `@/components/ui`.** The library is extracted from the the client product prototype and is the only source of primitives — `Button`, `IconButton`, `Badge`, `Tag`, `CodePill`, `Card`, `PageHead`, `KpiTile`, `Table`, `Toolbar`, `FilterButton`, `FilterChips`, `Checkbox`, `Expander`, `TextLink`, `Field`, `SearchInput`, `Tabs`, `Modal`, `Toaster`, `Avatar`, and the four state components. A raw `<button>`, a hand-rolled badge, or a bespoke bordered div is lint-blocked. Missing something? **Add it to the library**, never to a feature folder.
14. **Read the prototype's MARKUP before building a screen**, not just its CSS — `docs/ui.md` and `.claude/rules/prototype-fidelity.md`. Extracting rules in isolation tells you what a card looks like but not that tabs sit outside it; every layout defect here came from inventing structure instead of copying it.
15. **Never `text-xs`/`text-sm`/`text-base`.** Tailwind pins their line-height (`text-xs` → 16px) while the prototype inherits 1.45, which makes every control shorter than the design. Write the pair: `text-[12px]/[1.45]`. There is also **one button size** — no `sm`.
16. **`src/features/_reference/` is the worked example** — a full page using every component, in the order a page uses them. Read it before building a new page. It is seven files because the page kept hitting the 150-line limit and the fix was always to split by concern.
17. Components are **owned source** — edit them directly. Never wrap one in another abstraction; that layer is what makes a library hard to customise, which is the exact thing owning the source avoids.
18. Design tokens live in `src/styles/index.css` — `bg-card`, `text-ink`, `border-line`, and the status pairs. **No hard-coded hex**, lint-blocked. Status colours are foreground/background pairs; never mix across pairs.
19. Every interactive element is keyboard reachable and labelled. `jsx-a11y` runs as an error, not a warning.
20. All four states on every data surface, via `SkeletonRows`, `EmptyState`, `ErrorState`, `PartialState`. `EmptyState` requires a `variant` because "no data yet" and "no results for this filter" need different words and different actions.

### Forms — every control answers for itself

These four are not preferences. Each one was reported as a bug — a save that
failed with nothing on screen, a required field the form let through, a box with
no idea what belonged in it, and a Download button that gave no sign it had been
pressed.

20a. **Every control renders the server's message for its own field.** The API
     answers `{ error: { details: [{ path, message }] } }`, and `path` is the
     field name — so a control asks for its message by that path and renders it
     in its `Field`'s error slot. **And every form carries `FormErrorSummary`
     with the paths it handles**, so anything the server refused that no control
     claims — a NOC, a deviation, a rule added tomorrow — appears instead of
     vanishing. A refusal the user can only read in the network panel is the
     same as no refusal at all. Never replace a specific server sentence with a
     generic "could not be saved": that sentence usually names the fix.
20b. **Client-side validation wherever the browser can answer it.** `required`,
     `pattern`, `minlength`, `maxlength`, `min`, `max` and `type` go on the
     control; `useFormValidation` + `FormValidityProvider` turn them into the
     product's own messages on submit (`src/hooks/use-form-validation.ts`).
     A round trip to be told a mandatory field is empty is a round trip the
     browser already knew about. The server still checks everything — the client
     check is for speed, never for trust — and a multi-tab form ALSO needs a
     record-wide check, because the DOM holds only the pane on screen
     (`agent-completeness.ts` is the worked example).
20c. **Every input, select and combobox has a placeholder** — `Select grade`,
     `e.g. ABCDE1234F`, `6 digits`. From the i18n catalog like every other
     string, and matching the prototype's own placeholders where it has them
     (`.claude/rules/prototype-fidelity.md`). A bare box asks the user to guess
     the format, and the guess is what the server then rejects.
20d. **A control that fires a request shows its own pending state**, through
     `busy` on `Button` or `IconButton` — which disables it AND draws the
     spinner. Those are two different promises and the control needs both: the
     disable is what stops the second click, the spinner is what says why
     nothing has happened yet. Reported as a bug on Export Reports, where
     Download made no round trip visible at all and was pressed repeatedly. A
     bare `disabled={x.isPending}` is half of it — a control that greys out with
     no other change reads as broken, not busy.

### Types

21. `strict: true`. No `any`, no `!` non-null assertions outside generated code and tests. Lint-enforced.
22. Dates are formatted through `src/lib/datetime` using the **tenant's** timezone, never the browser's. A tenant in another region seeing their own timestamps shifted is a support ticket every time.

### Feature workflow — `docs/feature-workflow.md`

23. **Every feature follows `docs/feature-workflow.md`.** No "small change" exemption.
24. A feature covers **frontend and backend together**. Link the matching `server-app` PR; they land together.
25. Work in a **git worktree** — `git worktree add ../app-web-feat-<name> -b feat/<name>`, then **`pnpm install` in it** (~1.2s). Skipping it silently disables the lint hook and breaks `pnpm gate`.
26. Before editing, `/graphify query "what renders X"`. On finish, `/graphify . --update` — a stale graph makes the next feature's first step misleading.
27. Before opening a PR: `pnpm gate`.
28. Style is governed by `STYLE_GUIDE.md`. **Until it is written, the ESLint and Prettier configs are the style guide.**
29. File size is lint-enforced: **250 lines per module, 150 per component, 50 per function**. A 150-line component is usually three components.
30. Comments explain **why**, never what.
31. Verify against **real data volume** — render 10,000 fixture rows and confirm virtualization and server-side pagination hold. Local fixtures hide this until a customer finds it.
32. Entry bundle stays under **250KB gzipped**. Heavy dependencies are lazy-loaded at the route.

### Observability — `docs/observability.md`

33. `src/api/client.ts` reads **`X-Trace-Id`** off every response and attaches it to error reports. Nothing else in the app touches trace IDs.
34. **The browser never generates a trace ID.** X-Ray encodes a timestamp in the first 32 bits and rejects IDs older than 30 days — a skewed client clock means silently dropped traces, which looks exactly like everything working. The backend is always the trace root.
35. Report to `/client-errors`: unhandled rejections, uncaught errors, and API failures the user actually saw. **Never** form contents, tokens, PII, or full payloads. Deduplicate and cap per session — one broken render fires the same error every frame.
36. Surface the correlation id in the error UI. A support ticket with one is a two-minute query; without one it is archaeology.
37. **CloudWatch RUM is not enabled** and is deferred until real users. When it goes on: sample it (a single visit is ~20 billable events), and add `X-Amzn-Trace-Id` to the API's CORS allowed headers or every request starts failing.

### View state

38. **Pagination, filters, search, sort, and the active tab live in the URL**, never `useState`. **Lint-enforced** (`ez/url-state-for-view`). Use `useUrlState` / `useUrlSearch` / `useUrlSort` / `usePagination` from `@/hooks`.
39. **The page reacts to the parameter changing** — a pasted link and the back button must both work. Derive from the URL on every render; never copy it into component state once.
40. Every filter sets `resets: ['page']`. Filtering to fewer results while on page 7 lands the user on an empty page, which reads as a bug.
41. The default value is absent from the URL, so the canonical view has a clean address. Clamp bad values rather than rejecting them.

### Loading states

42. **Order is always pending → error → empty → data.** Never render an empty state before the request finishes — TanStack Query leaves `data` undefined in flight, so an emptiness check that runs first shows "No data found" on every load. **Lint-enforced** (`ez/loading-before-empty`); it is a rule because it keeps being written wrong.
43. The skeleton is **shaped like the result**, not a spinner — same rows and columns, so nothing jumps on arrival.
44. Use `isPending`, not `isLoading`: with `placeholderData` a refetch leaves `isLoading` false while `data` is still the previous page.

### Speed — `docs/performance.md`

**No SSR.** Authenticated dashboard: no SEO, per-tenant responses are not CDN-cacheable, and an SSR service would either duplicate the tenant connection registry or add a third network hop. Speed comes from the list below instead.

Every feature is checked for all of it — this is a standing step, not an occasional audit:

45. **New route = new lazy chunk**, registered with **`lazyPage`** (`src/app/page-chunk.ts`) — `React.lazy` is lint-blocked under `src/app`. Never added to the entry bundle. `pnpm gate` enforces entry ≤250KB and any route chunk ≤150KB. `lazyPage` keeps the loader reachable so the sidebar can warm the chunk on hover; there is nothing else to register, because `preload-route.ts` reads the route table. Note what this fixes: React Router navigates inside `startTransition`, which SUPPRESSES the Suspense fallback, so a click on a cold route holds the previous page — no skeleton — until the download lands.
46. **No waterfalls.** Independent queries run together via `useQueries`; one awaiting another spends a full round-trip for nothing.
47. **Prefetch on intent** for anything a click leads to — `prefetchProps(qc, key, fetcher)` fires on `onPointerEnter` _and_ `onFocus`, so keyboard users get the same head start.
48. **Read `Server-Timing`** in the devtools network panel before optimising — attribute the cost to server, network, or render first.
49. A repeat load should show **304s**, not full bodies. One request per view change, not one per keystroke.
50. The server owns pagination: render `page`/`total`/`hasNext` from the response, never compute them.

### Text and files — `docs/i18n.md`, `docs/files.md`

51. **Every user-visible string comes from an i18n catalog** — labels, empty states, errors, aria-labels, placeholders. A hard-coded string is one no translator will ever see. Keys are typed, so a typo is a compile error.
52. Name keys by **meaning** (`actions.retry`), not location. **Interpolate, never concatenate** — word order differs by language.
53. Files go through `src/api/files.ts` only. Upload is a presigned **POST** direct to S3; the file never passes through the API.
54. **Policy fields go into the FormData before the file** — S3 reads the form in order and ignores anything after it. Progress needs XHR; `fetch` has no upload progress event.
55. Download navigates to a signed URL rather than fetch-and-blob, so the browser streams to disk instead of holding the file in memory.
55a. **Downloads go through `useDownload`** (`@/features/_kit/use-download`), never a bare `downloadFile` in an `onClick` — **lint-enforced**. Signing a URL is a round trip with nothing on screen, so the click must report itself: `pendingKey` says WHICH file (a page-level boolean greys out every row in the table), and `onFailed` gives a refused signature somewhere to go instead of being swallowed by `void`. A hook that `await`s `downloadFile` inside its own `mutationFn` is the same guarantee reached another way, and is exempt.

### CI/CD — `docs/cicd.md`

56. AWS-native: CodePipeline + CodeBuild, no GitHub Actions. **The pipeline is not provisioned yet — `pnpm gate` is the interim PR gate** and must stay identical to `buildspec.yml`.

### DRY — `.claude/rules/dry.md`

57. **Every piece of knowledge has one authoritative place.** API types are generated, query keys live in `api/query-keys.ts`, strings in `i18n/locales`, colours in CSS variables, primitives in `components/ui`, view state in the URL.
58. **Rule of three**, and a wrong abstraction costs more than duplication. A component with eight boolean props serving four callers is harder to change than four components.
59. **Composition over configuration.** `<Card><CardHead/></Card>`, not `<Card hasHeader/>`. A boolean prop that switches layout means it is two components.
60. Missing a primitive? **Add it to `components/ui`** rather than building it in a feature folder — that is how the fifth caller avoids writing it a fifth time.

---

## Layout

```
src/
  api/
    generated/        # from openapi.json — never edited by hand
    client.ts         # fetch wrapper: auth, correlation id, error mapping
  components/
    ui/               # the component library — every UI surface is built from these
    <domain>/
  features/<domain>/  # routes, hooks, tables, forms for one domain
  hooks/
  lib/                # datetime, formatting, utils
  stores/             # Zustand — UI state only
```

## How these rules are enforced

| Layer                | What it does                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` hook   | Lints every `.ts`/`.tsx` file as it is written                                                                                                       |
| `.claude/rules/*.md` | Path-scoped detail that auto-loads on matching files — `src/api/**` pulls in the query-key and generated-types rules, `**/*.tsx` the component rules |
| `Stop` hook          | **Blocks the turn from ending while `pnpm typecheck` fails**                                                                                         |

## Working agreement

- Run `pnpm gate` before declaring work done. A `PostToolUse` hook lints each file you touch and a `Stop` hook typechecks the project — do not disable either.
- Never add an `eslint-disable` for a rule in the "Hard rules" section. If a rule is genuinely wrong, change the rule and the doc together, in one PR, with the reason.
- When a rule here conflicts with what you were about to write, the rule wins. Say so and propose the change rather than working around it.
