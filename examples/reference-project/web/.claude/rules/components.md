---
paths:
  - 'src/**/*.tsx'
---

# Components — build ONLY from the library

Full detail: `docs/ui.md`. The design system is extracted from the the client product
prototype and lives in `src/components/ui`.

## The rule

**Every UI surface is built from `@/components/ui`.** Import from the barrel:

```tsx
import { Badge, Button, Card, CardHead, EmptyState, Table, Td, Th, Tr } from '@/components/ui';
```

A raw `<button>`, a hand-rolled badge span, or a bespoke bordered div is how a
design system fragments one screen at a time. Lint blocks `<button>`,
`<dialog>`, and hard-coded hex colours outside the library.

| Need                    | Component                                                                      |
| ----------------------- | ------------------------------------------------------------------------------ |
| Any action              | `Button` — `primary` `accent` `danger` `warn` `ghostDanger` `ghostWarn` `review` |
| Status                  | `Badge` (tone pair) or `StatusDot` (adds an indicator)                         |
| Grouped surface         | `Card` + `CardHead` + `CardBody`                                               |
| Page title / breadcrumb | `PageHead`                                                                     |
| Figures                 | `KpiTile` + `KpiRow`                                                           |
| Tabular data            | `Table` `Th` `Td` `Tr` `Pager`                                                 |
| Filter box              | `SearchInput`                                                                  |
| Form input              | `Field` + `Input`                                                              |
| Dialog                  | `Modal`                                                                        |
| Transient feedback      | `Toaster` + `useToasts`                                                        |
| Person                  | `Avatar`                                                                       |
| The four states         | `SkeletonRows` `EmptyState` `ErrorState` `PartialState`                        |

**Missing something? Add it to the library**, do not build it in a feature
folder. That is how the library grows correctly.

## Read the reference first

`src/features/_reference/` is a complete page built from every component, in
the order a page uses them. Copy its structure:

```
AppShell > PageHead > KpiRow > Card( CardHead, Toolbar, FilterChips, Tabs,
  SkeletonRows|ErrorState|EmptyState|Table+Pager ) > Modal > Toaster
```

It is seven files because the page kept hitting the 150-line limit and the fix
was always to split by concern, never to raise the limit.

## Tokens

Colours, radii, and surfaces come from `src/styles/index.css`: `bg-card`,
`text-ink`, `text-ink2`, `text-muted`, `border-line`, `bg-navy`, `bg-accent`, and
the status pairs `ok`/`ok-bg`, `warn`/`warn-bg`, `bad`/`bad-bg`, `info`/`info-bg`,
`grey`/`grey-bg`.

Status colours are **foreground/background pairs** — never mix across pairs.

**Single theme — no dark mode.** `dark:` variants are lint-blocked, and there is
no `prefers-color-scheme` block. The prototype defines one appearance and every
user gets it regardless of their OS setting. `color-scheme: light` on `:root`
plus the meta tag in `index.html` keep native controls (selects, scrollbars,
autofill) from rendering dark on a light page.

## View state lives in the URL

**Pagination, filters, search, sort, and the active tab go in search params**,
never `useState`. Lint-enforced (`ez/url-state-for-view`).

```tsx
// WRONG — cannot be shared, resets on reload, back button leaves the page
const [status, setStatus] = useState('queued');

// RIGHT
const [status, setStatus] = useUrlState('status', {
  defaultValue: 'queued',
  allowed: STATUSES,
  resets: ['page'], // a new filter must return to page 1
});
```

Hooks in `@/hooks`: `useUrlState` (one param), `useUrlSearch` (text box, uses
`replaceState` so typing does not fill the history stack), `useUrlSort`
(`sort=column:direction` as one param, so a half-applied sort is not
representable), `usePagination`, `useResetUrlState`.

What this buys, and what its absence costs:

- A view can be **shared** — the recipient sees the same screen, not page 1.
- **Reload** does not reset the screen.
- **Back and forward** step through view changes, rather than leaving the page.
- Support can ask for **the URL** instead of a description.

Four rules when using it:

- **The page must react to the parameter changing**, including from a pasted
  link or the back button. Derive from the URL on every render; never copy it
  into `useState` once.
- **`resets: ['page']`** on every filter. Filtering to a smaller result set
  while staying on page 7 lands the user on an empty page, which reads as a bug.
- **The default value never appears in the URL**, so the canonical view has a
  clean address and two routes to the same screen share one URL.
- **Clamp, do not reject.** A bad parameter is a stale link or a bot walking
  values; landing somewhere valid beats an error screen.

Genuinely local state — an open dialog, a hover, a form field mid-edit — stays
in `useState`. None of it belongs in a URL.

## Forms — three rules, each of them a reported bug

**Every control renders the server's message for its own field.** The API sends
`details[{ path, message }]` and `path` IS the field name, so a control looks its
own message up by that path and renders it in the `Field` error slot. Pair it
with `FormErrorSummary handled={...}` on the form, which shows anything the
server refused that no control claimed. Agent Onboarding refused a submit for
Risk approval and eleven missing documents and said NOTHING on screen — the only
way to read it was the network panel. Never swap a specific server sentence for
"could not be saved"; the sentence usually names the fix.

**Client-side validation wherever the browser can answer it.** Put `required`,
`pattern`, `minlength`, `maxlength`, `min`, `max`, `type` on the control and let
`useFormValidation()` + `<FormValidityProvider>` render the product's own
messages on submit. The server still validates everything — this is for speed,
not for trust. A form whose panes are TABS needs a second, record-wide check as
well: `checkValidity()` sees only the pane in the DOM, so a missing field on a
tab nobody opened would pass (`features/agents/agent-completeness.ts`).

**Every input, select and combobox has a placeholder**, from the i18n catalog:
`Select grade`, `e.g. ABCDE1234F`, `6 digits`. Where the prototype has one, use
its words. A bare box makes the user guess the format, and the guess is what the
server rejects.

## A control that fires a request says so

`Button` and `IconButton` take **`busy`**: it disables the control and draws the
spinner. Both halves matter — the disable is what stops the second click, the
spinner is what tells the user why nothing has happened yet. A bare
`disabled={m.isPending}` greys the control out with no other change, which reads
as broken rather than busy.

```tsx
<Button busy={save.isPending} onClick={...}>{t('actions.save')}</Button>
```

The label does NOT change with it. Swapping "Download" for "Downloading…"
reflows the row, and most of these buttons sit inside tables.

**Downloads are the case this was written for.** `downloadFile` POSTs for a
signed URL and only then navigates, so between the click and anything visible
there is a full round trip. Use `useDownload` from `@/features/_kit/use-download`
— a bare `downloadFile` in an `onClick` is lint-blocked:

```tsx
const file = useDownload({ onFailed: () => { push(t('errors.download'), 'bad'); } });
...
<Button busy={file.isDownloading(row.key)} onClick={() => { file.download(row); }}>
```

`pendingKey` rather than a boolean, because these buttons sit in rows: a
page-level flag disables all forty of them the moment one is clicked.

## The state order is pending -> error -> empty -> data

**Never render an empty state before the request has finished.** This is
lint-enforced (`ez/loading-before-empty`) because it has been written wrong
repeatedly.

```tsx
// WRONG — flashes "No data found" on every single load
{data.length === 0 ? <EmptyState/> : <Table/>}

// RIGHT
{q.isPending ? <SkeletonRows/>
 : q.isError  ? <ErrorState onRetry={...}/>
 : q.data.length === 0 ? <EmptyState variant="no-results"/>
 : <Table/>}
```

Why it happens: TanStack Query leaves `data` **undefined** while a request is in
flight, so `(data ?? []).length === 0` is `true` before the response arrives.
The user sees "No results", then the rows appear. It reads as a broken product.

Consequences to keep in mind:

- The skeleton must be **shaped like the result** — same row count and column
  widths — so nothing jumps when data arrives. A centered spinner throws away
  that layout information.
- `isPending`, not `isLoading`: with `placeholderData` a refetch keeps
  `isLoading` false while `data` is still the previous page.
- On a filter change use `placeholderData: keepPreviousData` so the table does
  not collapse to a skeleton on every keystroke.
- `EmptyState` requires `variant`: `no-data` ("nothing exists yet", offer the
  create action) is a different message from `no-results` ("nothing matches this
  filter", offer to clear it).

## Non-negotiable

- **All four states**, every data surface. `EmptyState` requires a `variant`
  because "no data yet" and "no results for this filter" need different words.
- **Every table is paginated, server-side, with `Pager`.** Classic style: items
  per page, Prev, numbered pages, Next.

  ```tsx
  const { page, pageSize, setPage } = usePagination();
  const q = useThings({ page, pageSize }); // whole envelope, not .data
  const { from, to } = pageRange(page, pageSize, q.data.total);

  <Pager
    page={q.data.page}
    totalPages={q.data.totalPages}
    hasPrevious={q.data.hasPrevious}
    hasNext={q.data.hasNext}
    onPageChange={setPage}
    labels={{
      ...t('pager', { returnObjects: true }),
      range: t('pager.range', { from, to, total }),
    }}
  />;
  ```

  `Pager` takes NO `pageSize`, `totalIsCapped` or `onPageSizeChange` — an
  earlier version of this example passed all three and none of them exist. The
  prototype has no rows-per-page control, so `setPageSize` is exported by
  `usePagination` and wired to nothing. Page size is one constant,
  `DEFAULT_PAGE_SIZE`, and it must equal the server's.

  - **`page` and `pageSize` live in the URL** via `usePagination` — a filtered
    page must be shareable and the back button must work.
  - The query hook returns the **whole envelope**. Dropping `total` means the
    client would have to count rows it does not have.
  - **Changing a filter or tab resets to page 1.** Page 7 of "queued" rarely
    exists under "failed", and an empty page reads as a bug.
  - `totalIsCapped` renders as "10,000+". The server counts to a ceiling
    because an unbounded `COUNT(*)` scans every matching row per page view —
    never present a capped total as exact.
  - Never `getPaginationRowModel` or any client-side slicing. Tenant tables
    reach hundreds of thousands of rows.

- Figures use `numeric` on `Th`/`Td`, which right-aligns and applies tabular
  numerals so a column reads down the digits.
- Dates through `src/lib/datetime` with the **tenant's** timezone. Money is an
  integer in minor units, never a float.
- Keyboard reachable, visible focus, icon-only buttons labelled. `jsx-a11y` is
  an error.
- Colour never carries meaning alone — pair it with text or an icon.
- File limits: 250 lines per module, **150 per component**.

## Overlays inside a Modal

Two traps, both found by driving the app rather than reading it.

**A popup positioned `absolute` is clipped by the modal body.** `Modal` makes
its body the only scroller (`overflow-y-auto`), which establishes a clipping
context — a dropdown opened inside it rendered as a sliver showing one option.
Position overlays `fixed`, measured from the trigger's `getBoundingClientRect()`,
and reposition on scroll and resize with a **capture-phase** listener: the
scroll that matters is an ancestor's, and scroll events do not bubble.

**Swallow Escape only while the overlay is open.** `Modal` is a native
`<dialog>`, which closes on Escape for free. A Combobox that calls
`stopPropagation()` unconditionally traps the user in the dialog; one that never
calls it lets a single Escape close both the dropdown AND the modal, discarding
a half-filled form. The rule is: open → `preventDefault()` + `stopPropagation()`
and close the list; closed → let it through. Both halves need a test.

## Transforms — never `will-change: transform` on zoomable content

It promotes the element to its own compositor layer, which the browser
rasterises ONCE at the current scale and then stretches. Text goes soft the
moment the user zooms in. Panning is a composited transform either way and stays
smooth without it. Reach for `will-change` only when profiling shows a specific
paint cost, never as a default optimisation.

## Stable callbacks from a hook are load-bearing

Any function a hook returns that ends up in a `useEffect` dependency array must
be wrapped in `useCallback`. An inline arrow is a new value every render, so the
effect re-runs every render.

This is not a lint nicety — it caused a silent feature failure. `useExpanded`
returned `setBase` as an inline arrow; the effect seeding the org chart from the
server slice therefore re-ran constantly and reset the node set, wiping every
merged subtree microseconds after it arrived. Expanding a node appeared to do
nothing at all.

When an effect must depend on a hook's setter, destructure the setter rather
than depending on the hook object — the object is a new value every render even
when everything inside it is stable.
