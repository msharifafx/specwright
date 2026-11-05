---
paths:
  - 'src/storage/**/*.ts'
  - 'src/mail/**/*.ts'
  - 'src/i18n/**/*.ts'
  - 'src/main.ts'
  - 'src/worker.ts'
---

# Files, email, and text

## S3 is the only file path — `docs/storage.md`

- **Files never pass through the API.** Mint a signed request; the browser talks
  to S3 directly. A 25MB body through an ECS task is a task not serving requests.
- **Uploads are presigned POST, never PUT.** S3 does not verify Content-Length
  on a PUT even when signed, so a PUT cannot enforce size or content type. The
  POST policy's `content-length-range` and `eq` conditions ARE enforced by S3.
- **The client never supplies a key.** Keys are server-generated and
  tenant-prefixed: `t/<tenantId>/<category>/<date>/<uuid>-<name>`. A
  client-supplied key is path traversal.
- **`assertTenantOwnsKey` before signing a download.** This is the
  authorisation check, not a formality — without it any user can sign a URL for
  another tenant's file.
- Content types are an **allowlist**. Never `starts-with` on a type prefix:
  `image/` admits `image/svg+xml`, which is stored XSS from your own origin. For
  spreadsheet categories the type is derived **server-side from the file
  extension** rather than trusted from the request — browsers disagree about
  `.csv` and `.xlsx`, and the POST policy pins Content-Type with `eq`, so a
  browser that guesses differently fails against S3 rather than against us.
- Signature lifetime stays at 300s for downloads and for most uploads. A signed
  URL is a bearer credential. The one exception is `loan-import` at 1800s,
  because 300s covers a request and not a 200MB **transfer** — raise it per
  category, never globally.
- The platform ceiling is **200MB** (`MAX_UPLOAD_BYTES`), and `CATEGORY_LIMITS`
  lowers it per category. That map is **floor-lowering**, so raising the platform
  number means auditing the list or an unlisted category inherits the new bound.
- Over the category's ceiling, or anything a user waits for, is a **job** —
  worker writes to S3, records the key on `job_runs`, UI polls then downloads.

## Email — `docs/i18n.md`

- Subjects and bodies come from the **`templates` table**, resolved by
  `TemplatesService.resolve(tenantId, channel, key, locale)` — the tenant's own row wins
  by existing, the central row is the platform default. **Never an inline
  string, and no longer `emails.json`**: an error message is the product's
  words, an email body is content a tenant may rewrite without a deploy.
  Platform defaults are versioned one file per channel —
  `scripts/data/templates-{email,sms,in-app}.json` — and written by
  `pnpm seed:templates` (idempotent). The table is keyed by
  `(channel, key, locale)`: `subject` is the email subject, the in-app TITLE,
  and unused for SMS.
- **Locale falls back** `en-IN` → `en` → `en-US`. Tenants are registered `en-IN`
  and the defaults are seeded `en-US`, so exact-match-only means every send
  throws — inside a worker, where the symptom is a DLQ entry and a user who
  never received their invite.
- Cache the two layers **separately**, never the resolved answer: `invalidate()`
  is exact-key `DEL`, so a resolved-per-tenant key would make one central edit a
  fan-out of N keys.
- `render()` does `{{name}}` substitution and nothing else. A template body is
  tenant-editable, so it must never be able to evaluate anything.
- The catalog still owns the chrome — `emails:common.signoff` and
  `emails:common.footer`, appended by `composeBody`. That is all `emails.json`
  is still read for.
- Sending is a **job**, never a request-path call. An SMTP handshake inside a
  request holds a pooled database connection while waiting on a third party.
- Log the messageId and template. **Never the body** — it is customer content.
- SMTP, not the SES SDK: SES speaks SMTP, so the same code runs against Mailpit
  locally and SES in AWS. The transport is configuration.

## i18n — `docs/i18n.md`

- **Every user-visible string comes from a catalog**, including API error
  messages. Error responses carry a machine `code` plus a translated `message`.
- **Locale comes from the tenant's registry row**, never the server environment
  and never a browser header alone.
- **Not translated:** log messages (operators need greppable text), error `code`
  values (a machine contract), job keys, queue names, database identifiers.
- Interpolate, never concatenate — word order differs by language.
- Name keys by meaning (`actions.retry`), not by location.
