---
paths:
  - 'src/**/*.tsx'
  - 'src/styles/*.css'
---

# Prototype fidelity

The design source of truth is the prototype committed in the workspace repo:

```
<workspace>/docs/domain-graph/sources/Clickable_Prototype.html
```

That copy, not one under `~/Documents` or `~/Downloads` — it is committed, so a
teammate cloning the workspace actually has it, and `docs/domain-graph/` is where
the BRDs live too.

**v2 is the current revision** (Aug 2026). `Clickable_Prototype.html 3.html`
is still in `sources/` because the domain graph cites it, but it is the OLD brand:
teal `#0e9f8e` on blue-navy chrome. v2 is orange `#f78f34` on violet-navy, with a
four-value accent ramp (`--acc`, `--acc-ink`, `--accbg`, `--acc-line`) that v1.1
does not have. Extracting a colour from v1.1 now produces a screen that is off-brand
in a way `pnpm gate` cannot see. Name the revision when you quote a value.

The path is absolute because a feature worktree lives in
`app-feat-<name>/`, not beside the workspace repo, so no single relative path
works from both checkouts. If the workspace is cloned elsewhere, adjust the
prefix.

## Read the DESIGN RULES, not just the field list

The prototype tells you two different things and it is easy to take only the
first: WHAT a form contains, and HOW it presents them. Extracting the field list
and then building to your own conventions produces a screen that has the right
data and looks nothing like the design.

Every form in the prototype carries all of these. Check each before saying a
form is done:

| Convention | Prototype source |
| --- | --- |
| Red asterisk on every mandatory label | `.req { color: var(--bad) }` |
| A placeholder on every input and select | `Select grade`, `Select back office` |
| Status as a segmented Active/Inactive switch, content-width | `.seg`, `.seg button.on` |
| A one-line subtitle under the modal title | `.msub` |
| Coloured section bands with a rule to the right edge | `.msec.teal` / `.orange` / `.green` — v2 keeps the class NAMES while `.teal` renders accent orange; our `FormSection` calls the first tone `accent` |
| A per-modal primary button label | `Add User`, `Save Bank / NBFC` — never a generic `Save` |
| Multi-select chips INSIDE the control, with `+N more` | `.chipselect`, `.more` |
| Field order exactly as laid out | three-across `.fgrid3` reads across, not down |

## Read the MARKUP, not just the CSS

Extracting CSS rules in isolation tells you what `.card` looks like. It does not
tell you that tabs sit **outside** it, that list screens have **no card header**,
or that the user chip is avatar-then-text. Every layout defect in this codebase
came from inventing structure instead of copying it.

Before building a screen: open the file, find the `<section class="screen">` for
it, and read the DOM. It takes a minute and settles every structural question.

```bash
# The markup is one long line; this makes it readable.
python3 - <<'PY'
import re
s = open('<workspace>/docs/domain-graph/sources/Clickable_Prototype.html
         encoding='utf-8', errors='replace').read()
i = s.find('data-crumbs="Business Users / Agent Onboarding"')
print(re.sub(r'<svg.*?</svg>', '', s[i:i+2000], flags=re.S).replace('><', '>\n<'))
PY
```

### Extracting a modal's fields, in one command

The single most useful snippet — it answers field order, which fields are
mandatory, what the placeholders say, and what the primary button is called:

```bash
python3 - <<'EOF'
import re, html
P = '<workspace>/docs/domain-graph/sources/Clickable_Prototype.html
h = open(P, encoding='utf-8', errors='replace').read()
mid = 'm-adduser'                     # m-addbank, m-adddsa, m-addbent, m-addpayout
i = h.find('id="%s"' % mid)
# Stop at the NEXT overlay, or the fields of the modal after this one bleed in.
nxt = re.search(r'id="m-[a-z0-9]+"', h[i + 10:])
seg = h[i:i + 10 + nxt.start()] if nxt else h[i:i + 14000]

head = re.search(r'<h3>(.*?)</h3>', seg, re.S)
print('TITLE/SUB:', html.unescape(re.sub(r'<[^>]+>', ' | ', head.group(1))).strip())
for m in re.finditer(r'<label>(.*?)</label>', seg, re.S):
    # The label already contains the asterisk as <span class="req">*</span>,
    # so strip tags and read it — do not append a second one.
    print('  field:', html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip())
for m in sorted(set(re.findall(r'<option value="" selected>([^<]+)</option>', seg))):
    print('  placeholder:', html.unescape(m))
foot = re.search(r'<div class="mfoot">(.*?)</div>', seg, re.S)
if foot:
    print('BUTTONS:', re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '|', foot.group(1)))))
EOF
```

## Sizing — the trap that made everything look wrong

**Never `text-xs`, `text-sm`, or `text-base`.** Tailwind pairs each with a fixed
line-height (`text-xs` → 16px), while the prototype inherits 1.45 from `body`.
Every control rendered noticeably shorter than the design because of this one
utility. Always write the pair: `text-[12px]/[1.45]`.

**One button size.** The prototype has `.btn` and nothing else. A `sm` variant
was invented here, every page reached for it, and every button was undersized.

**State the control height; do not derive it from padding.** The prototype's
`.fld input { padding: 8px 10px }` at 12.5px computes to 38px in ITS stylesheet
and to 33px under Tailwind's preflight, which resets line-height and box-sizing.
Copying the padding therefore reproduces the design in neither. `CONTROL_BASE`
in `components/ui/field.tsx` carries `h-[38px]` and every form control uses it —
Input, Textarea (which overrides for multiple rows), Select, the Combobox
trigger and its popup search box, FieldSegmented, SearchInput, and the filter
pills. An input a few pixels shorter than the select beside it is the kind of
misalignment that reads as sloppy without anyone being able to name it.

**Measure, do not eyeball.** Getting this right took several rounds of guessing
because the difference is five pixels. One script settles it:

```js
// In a Playwright/chromium-cli session, with a modal open:
await dialog.evaluate((d) => [...d.querySelectorAll('label')].map((l) => {
  const el = d.querySelector(`#${CSS.escape(l.htmlFor)}`);
  return { field: l.textContent.trim(), h: el?.getBoundingClientRect().height };
}));
// Every row must report the same height.
```

Exact values, from the prototype:

| Element              | Value                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `.btn`               | 12px/1.45, padding 7px 13px, gap 6px, radius 7px                         |
| `.search`            | 12px, padding 6px 10px, `flex: 0 1 320px`, min-width 250px, bg `#f7f9fc` |
| `.filter`            | 12px, padding 6px 10px, white bg                                         |
| `.pg` (pager button) | 26px square, radius 6px                                                  |
| `.avatar`            | 28px, 50% radius, navy, 11px                                             |
| `.icoact`            | 26px square, radius 6px                                                  |
| `.fld label`         | 11px bold uppercase, letter-spacing .3px                                 |
| `.fld input`         | 12.5px, padding 8px 10px                                                 |
| table `th`           | 10.5px bold uppercase on `#f7f9fc`, padding 9px 10px                     |
| table `td`           | padding 9px 10px, nowrap, hover `#fafbfe`                                |
| `.ic` (icon in `.icoact`) | 16px                                                                |

## Icons — copy the path, never redraw it

**Copy the `d` attribute verbatim** from the prototype's inline SVG. A pencil
drawn from memory is recognisably not the same pencil, and the difference is
obvious beside the design while being invisible in a diff.

```bash
python3 -c "
import re
s=open('<workspace>/docs/domain-graph/sources/Clickable_Prototype.html).read()
i=s.find('scr-bu-users')                       # the screen you are building
m=re.search(r'<td>(\s*<span class=\"icoact.*?)</td>', s[i:i+14000], re.S)
print(m.group(1).replace('</span>','</span>\n'))"
```

**Do not swap a glyph because the semantics differ.** Archive is not delete, so
an archive box seemed more honest here — but the prototype uses one destructive
glyph in every row of every screen, and a second one means the same red button
looks different depending on which table you are in. The wording carries the
distinction; the icon carries the severity.

## A class exists ≠ this screen uses it

`.icoact` has five variants. List rows use plain `.icoact` and `.icoact.red` —
**neutral grey, colour on hover**. `.editb` and `.delr` are permanently tinted
and appear only on Master Configuration. Picking a tinted variant for a list row
makes every table shout.

Grep which screen actually uses a class before adopting it:

```bash
grep -o 'class="icoact[^"]*"' prototype.html | sort | uniq -c
```

## Cursors

The prototype sets `cursor:pointer` on **`.btn`, `.icoact`, `.utab`, `.tab`,
`.pg`** — Tailwind's preflight sets `cursor: default` on `button`, so without it
every control feels dead. Handled globally in `src/styles/index.css`, not per
component; disabled controls get `not-allowed`, since a pointer over something
inert misstates what a click does.

## Layout

- **Tabs go OUTSIDE the card**, directly under the page head. They switch what
  the card contains; nesting them says the card owns its own filter.
- **List screens have no card header.** The page title already names the thing.
- **Search is a fixed ~320px control inside a `Toolbar`**, never a full-width
  bar — full width implies the whole row is a search surface and leaves nowhere
  for filters and bulk actions.
- **Pager**: `Showing <b>N</b> of <b>M</b> records` on the left, `‹ 1 2 3 … 12 ›`
  on the right. **No per-page select** — the prototype has none. Hide the page
  buttons entirely at a single page; a disabled `‹ 1 ›` is three dead controls.
- **Modal**: `.mhead` 15px/18px with a 15px title and a 28px bordered close
  button · `.mbody` 16px/18px, capped at 70vh, **the only scroller** ·
  `.mfoot` 13px/18px. Actions live in the footer and reach the form through
  `form={FORM_ID}`, or Save scrolls away with the content.
- **Sidebar**: brand and console switch are pinned; only the nav list scrolls.

## Chrome

- **Focus is the accent**: `outline: 2px solid rgba(247,143,52,.3)` plus an
  accent border. Not removed, not navy, and never two rings — a bare input inside
  a bordered wrapper must suppress its own (see `.control-shell`).
- **Single theme.** No `dark:` variants (lint-blocked), no `prefers-color-scheme`.
  `color-scheme: light` on `:root` and the meta tag keep native controls light.
- **Title Case** for buttons and modal titles: "Add Role", not "Add role".
  Sentence case stays for descriptions and hints — those are prose.
- Typography is `13px/1.45 "Segoe UI", system-ui, -apple-system, Arial`.

## Two cascade traps

**A bare element selector beats a utility class.** `a { color: navy }` is
emitted after Tailwind's utilities, so it overrode `text-white` and turned the
active sidebar item navy-on-accent. Scope base styles so utilities win:

```css
a:not([class*='text-']) {
  color: var(--color-navy);
}
```

**Skeletons must match the shape they replace** — and a route's Suspense
fallback must match that route's query skeleton. Two different shapes fire in
sequence on a cold route (chunk download, then fetch), and the user sees the
page load twice. `SkeletonRows` draws a table; `SkeletonBlock` draws a panel.
Use the one that matches.

**And where nothing has a shape, use `PageSpinner`.** Every route once shared
one list-shaped fallback, so a sign-in form, the workspace-entry page and the
"Login as user" hand-off each rendered a page head, a tab strip and a table
before throwing all of it away. Holding a layout is only worth doing when it is
the layout that arrives:

| The result is | Fallback |
| --- | --- |
| A table | `SkeletonRows`, matching the column count |
| A known set of cards | A skeleton shaped like them (`TenantDetailSkeleton`) |
| A form, one panel, or a redirect | `PageSpinner` |

## When the prototype and a convention disagree

The prototype wins, and say so in a comment. Two examples already in the code:
the breadcrumb bolds the **product name** rather than the current page, and
text inputs show their focus ring on click as well as on keyboard. Both are
the opposite of the usual advice, and both are deliberate.
