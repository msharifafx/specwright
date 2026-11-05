---
paths:
  - 'src/**/*.tsx'
  - 'src/api/**/*.ts'
  # The route tables and the lazy-page barrels are .ts under src/app — the
  # files a new screen is registered in, and where the lazyPage rule below has
  # to be in front of you.
  - 'src/app/**/*.ts'
  - 'src/main.tsx'
---

# Speed — checked on every feature

Full detail: `docs/performance.md`. **No SSR** — an authenticated, per-tenant
dashboard gets little from it and pays for a server in the request path.

- **A new route is a new lazy chunk.** Never added to the entry bundle; the
  entry is what stands between a signed-in user and their first screen.
  `pnpm gate` enforces entry ≤250KB and any route chunk ≤150KB.
- **Register it with `lazyPage`, never `React.lazy`** — `src/app/page-chunk.ts`,
  and lint-blocked everywhere else under `src/app`. Both split the bundle the
  same way; only `lazyPage` keeps the loader reachable as `.preload`, which is
  what lets the sidebar warm the chunk on hover (`preload-route.ts`). Nothing
  else to register: the warmer reads the route table, so a screen added with
  `lazyPage` is warmed the day it exists. `preload-route.test.ts` walks the nav
  map and fails on any link that cannot be warmed.
- **Framework stays in vendor chunks**, split in `vite.config.ts`
  (`vendor-react`, `vendor-router`, `vendor-i18n`). react-dom's production
  build alone is ~523KB minified — that is not shrinkable, but it must not
  share a filename with our code. A vendor chunk changes only on a dependency
  upgrade, so after the first visit a returning user downloads ~30KB and hits
  cache for the rest; in one file, a one-line change invalidates all 600KB.
  Adding a dependency to the entry means checking whether it belongs here.
- **No waterfalls.** Independent queries run together via `useQueries`. One
  awaiting another spends a full round-trip for nothing.
- **Prefetch on intent** for anything a click leads to:
  `{...prefetchProps(qc, key, fetcher)}` on the link or row. It fires on
  `onPointerEnter` **and `onFocus`** — keyboard users get the same head start.
- **Suspense fallback is a skeleton**, not a spinner — on a HARD LOAD, which is
  when it is the only thing on screen. It does NOT appear on an in-app
  navigation: React Router navigates inside `startTransition`, and a transition
  refuses to replace visible content with a fallback, so a click on a cold route
  holds the previous page until the chunk lands. That is the delay hover
  prefetch exists to remove — not a slow render.
- `placeholderData: keepPreviousData` on paginated lists, so a page change does
  not collapse the table to a skeleton.
- **Read `Server-Timing`** before optimising — attribute to server, network, or
  render first.
- **Measure before diagnosing a slow load.** `ls -la dist/assets/*.js` first.
  This app once had a 609KB entry beside a 45KB route chunk while the gate
  passed: the budget measures the ENTRY, and the entry was 188KB gzipped —
  under budget and still slow. A size check is not a load-time check, so when
  something feels slow, look at where the bytes actually are before changing
  code.
- **Audit `dependencies` when the bundle moves.** Five packages here were
  declared during scaffolding and never imported. Tree-shaking kept them out of
  the bundle, so they cost no bytes — but they cost 44MB of `node_modules` and
  they tell the next person those libraries are the sanctioned choice.
- The server owns pagination. Render `page` / `total` / `hasNext` from the
  response; never compute them.
- Repeat loads should show **304s**. One request per view change, not one per
  keystroke — filters debounce at 300ms.
