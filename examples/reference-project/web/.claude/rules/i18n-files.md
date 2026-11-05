---
paths:
  - 'src/**/*.tsx'
  - 'src/i18n/**/*.ts'
  - 'src/api/**/*.ts'
---

# Text and files

## Every user-visible string comes from a catalog

```tsx
const { t } = useTranslation('jobs');
<Button>{t('start')}</Button>          // yes
<Button>Start job</Button>             // no
```

No exceptions — button labels, empty states, error copy, aria-labels, and
placeholders included. A hard-coded string is one no translator will ever see.

Keys are typed via `src/i18n/i18next.d.ts`: a typo is a compile error, not a
literal `jobs.titel` rendering in production.

- Name keys by **meaning**, not location: `actions.retry`, not
  `jobsPageRetryButton`. The same action elsewhere reuses the key.
- **Interpolate, never concatenate.** `t('range', { from, to })` — word order
  differs by language, so `t('from') + ' – ' + t('to')` cannot be translated.
- Plurals use i18next `_one`/`_other`, not an `if`. Plural rules are not
  two-way in every language.
- Formatting is not translation: dates through `lib/datetime` with the
  **tenant's** timezone, money as an integer in minor units.

Catalogs: `src/i18n/locales/en-US/<namespace>.json`. Add a namespace per
feature so a route's strings do not bloat the entry bundle.

## Files go through `src/api/files.ts`

Never fetch or POST a file anywhere else.

- `uploadFile()` — asks the server for a ticket, then posts **direct to S3**.
  Policy fields must be appended to the FormData **before** the file; S3 reads
  the form in order and ignores anything after it.
- `downloadFile()` — asks for a signed URL, then navigates. Do not
  fetch-and-blob: navigation streams to disk, a blob holds the whole file in
  memory.
- Progress uses XHR because `fetch` still has no upload progress event, and an
  upload with no progress indicator is one users cancel.
- Check `file.size` against `ticket.maxBytes` before uploading. S3 rejects it
  anyway, but a local check gives an immediate specific message rather than an
  opaque 400 after the wait.
