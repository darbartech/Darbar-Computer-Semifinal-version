# Certificate System — Implementation Complete Report

**Project:** `Darbar-Computer-Semifinal-version`
**Scope:** PROMPT 6 — Seed data, final hardening, gates, smoke verification, report
**Status:** ✅ Complete with documented limitations (see *Known Limitations*)

> **Update 1.** The first pass shipped with the certificate flow statically verified only.
> Exercising it against the live database, a real render, and a real
> issue → reissue → download cycle in the browser surfaced seven defects, all now fixed
> and covered by regression tests — including a Zod 4 optional-key bug that made
> **issuing fail for every certificate** and one that **made generated PDFs impossible to
> download**. See [§7 Defects](#7-defects-found-during-runtime-verification) and
> [§8 PDF Output Verification](#8-pdf-output-verification).
>
> **Update 2 — PDF pipeline replaced.** The first pass invented an HTML/Playwright renderer
> from a zone map. That was **not the intended design**. The renderer is now a verbatim port
> of the reference project's `pdf-lib` engine and its `darbartech-certificate-v2` template.
> Parity is proven byte-for-byte: the page content stream produced here is **identical**
> (1 314 232 characters, FNV-1a `831d420f`) to the reference project's own output for the
> same payload. Only the PDF creation timestamp differs. The Playwright renderer, its HTML
> layout module, and its layout tests were deleted. See
> [§2.1 Renderer parity](#21-renderer-parity-with-the-reference-design).
>
> Gates after both changes: **234 tests across 11 files, typecheck, lint (0 errors), and
> build all pass**; the schema now has a committed baseline migration.

---

## 1. Summary

The programmable certificate system is implemented end to end and integrated into the
existing Next.js App Router site. All six prompts (foundation, DAL/actions, admin UI,
public verification, PDF generation, and hardening) are complete.

The implementation is **additive**. It introduced one new public route
(`/verify/[token]`), three admin routes (`/admin/certificates`,
`/admin/signatories`, `/admin/templates`), a server-only PDF pipeline, and supporting
DAL/action/DTO layers. No existing public URL, component visual, or database column was
removed or renamed.

**Scale of the deliverable:** 27 new code files / ~5,833 lines, plus a 164-line Zod
validator, six bundled OFL font binaries, seed data, and a baseline Prisma migration.

**The certificate design itself is not ours to invent.** The PDF pipeline is a port of the
reference project's `pdf-lib` engine and its v2 template, and the port is proven
byte-identical rather than approximately equivalent (§2.1).

---

## 2. Files Created

### Public verification
| File | Purpose |
|---|---|
| `src/app/verify/[token]/page.tsx` | Public verification route; `noindex, nofollow` metadata; throws `notFound()` for unknown/unpublished tokens |
| `src/app/verify/[token]/loading.tsx` | Streaming loading skeleton |
| `src/app/verify/[token]/not-found.tsx` | Generic invalid-token UI — reveals nothing about token validity |
| `src/app/verify/layout.tsx` | Verification layout (site header/footer, print styles) |
| `src/components/verify/VerificationCard.tsx` | Approved-field-only certificate display + print |

### Server — validation, DTO, DAL, actions
| File | Purpose |
|---|---|
| `src/lib/validators/certificates.ts` | Zod schemas for all certificate/signatory/template mutations |
| `src/server/dal/certificates/certificates.dal.ts` | Public lookup, admin CRUD, PDF data assembly, PDF persistence |
| `src/server/dal/certificates/signatories.dal.ts` | Signatory reference data |
| `src/server/dal/certificates/templates.dal.ts` | Template reference data |
| `src/server/dal/certificates/index.ts` | DAL barrel (`import "server-only"`) |
| `src/server/actions/certificates/certificates.actions.ts` | Create/update/issue/reissue/revoke/delete + PDF regeneration |
| `src/server/actions/certificates/signatories.actions.ts` | Signatory save/delete |
| `src/server/actions/certificates/templates.actions.ts` | Template save/delete |
| `src/server/actions/certificates/index.ts` | Action barrel |

### Server — PDF pipeline (port of the reference `pdf-lib` engine)
| File | Purpose |
|---|---|
| `src/server/certificates/pdf/generator.ts` | Maps stored data → reference input → vector A4 landscape PDF → local storage |
| `src/server/certificates/pdf/render-input.ts` | The only Darbar↔reference adapter; enforces exactly 4 modules and date-only strings |
| `src/server/certificates/pdf/types.ts` | Darbar PDF data/result types |
| `src/server/certificates/pdf/engine/certificateRenderer.ts` | **Verbatim** port of the reference pdf-lib renderer |
| `src/server/certificates/pdf/engine/templates/darbartech-certificate-v2.ts` | **Verbatim** port of the reference v2 template (the active design) |
| `src/server/certificates/pdf/engine/templates/darbartech-certificate-v1.ts` | Verbatim port of the reference v1 template (unused; `generator.ts` always passes v2) |
| `src/server/certificates/pdf/engine/textFitting.ts` | Verbatim port — text measurement, wrapping, shrink-to-fit |
| `src/server/certificates/pdf/engine/moduleFit.ts` | Verbatim port — module title/subtitle extraction and layout validation |
| `src/server/certificates/pdf/engine/qrGenerator.ts` | Verbatim port — verification-URL QR generation |
| `src/server/certificates/pdf/engine/dateFormatter.ts` | Verbatim port — certificate date formatting |
| `src/server/certificates/pdf/engine/types.ts` | The reference render contract, extracted verbatim |
| `src/server/certificates/pdf/fonts/LICENSING.md` | SIL OFL 1.1 attribution |
| `src/server/certificates/pdf/fonts/files/*.ttf` | 6 fonts, byte-identical to the reference project's `assets/fonts` |
| `src/server/certificates/utils.ts` | Date/Nepal-time formatting, filenames, sanitized logging, official-domain resolution |

**Removed** when the pipeline was replaced: `pdf/renderers/layout.ts`,
`pdf/renderers/qr.ts`, `pdf/fonts.ts`, and `tests/certificate-layout.test.ts`.

### 2.1 Renderer parity with the reference design

Ported files are edited only for import paths and the font directory. Parity was measured
against the reference project's own `scripts/renderReferenceCert.ts` payload:

| Property | Reference project | This repo |
|---|---|---|
| PDF size | 3 107 159 bytes | 3 107 158 bytes |
| Page content stream | 1 314 232 chars, FNV-1a `831d420f` | 1 314 232 chars, FNV-1a `831d420f` |
| Streams matching | — | 18 of 19 (the 19th is the Info dict) |
| Only difference | `/CreationDate`, `/ModDate` | 27 s apart |

Two deliberate, output-neutral deviations:

- **Font directory.** The reference resolves `<root>/assets/fonts`; this repo already had
  the same six TTFs under `src/server/certificates/pdf/fonts/files`. Verified byte-identical.
- **`date-fns` 4.4.0** instead of the reference's 3.6.0, because `@base-ui/react` pins v4.
  The rendered dates are identical, confirmed by the stream comparison above.

`tests/certificate-design-parity.test.ts` (23 tests) locks this in: it renders the reference
Aayara payload, then asserts a parseable single-page A4-landscape PDF (841.89 × 595.28 pt),
subset-embedded Montserrat + Cormorant with `FontFile2`, no missing-font warnings, the
expected `/Producer`, `/Creator` and `/Title`, and that the four-module rule surfaces as an
error instead of a broken PDF. Assertions read the PDF through `pdf-lib` and by inflating
object streams, because the engine packs the page tree and font descriptors into compressed
streams where raw byte scans cannot see them.

### Admin UI
| File | Purpose |
|---|---|
| `src/components/admin/certificates/CertificateForm.tsx` | Create/edit form |
| `src/components/admin/certificates/CertificateListTable.tsx` | Filterable/sortable list |
| `src/components/admin/certificates/CertificateDetailPanel.tsx` | Full record view + status actions |
| `src/components/admin/certificates/CertificateDialogs.tsx` | Confirm/revoke/delete dialogs |
| `src/components/admin/certificates/PreviewPanel.tsx` | Live preview |
| `src/components/admin/certificates/SignatorySelector.tsx` | Signatory picker |
| `src/components/admin/certificates/SignatoriesManager.tsx` | Signatory CRUD |
| `src/components/admin/certificates/TemplatesManager.tsx` | Template CRUD |

---

## 3. Files Modified

| File | Change |
|---|---|
| `package.json` | Added runtime `playwright@^1.63.0`; later replaced with `pdf-lib@^1.17.1`, `@pdf-lib/fontkit@^1.1.1`, `sharp@^0.33.5`, `date-fns@4.4.0` |
| `tsconfig.json` | Excluded reference-doc folders and scratch `.kilo/` worktrees |
| `eslint.config.mjs` | Ignored the same reference/scratch paths |
| `src/server/revalidate.ts` | Added `certificateVerifyTag()`, `PUBLIC_VERIFY_TAGS`, and `invalidateDetached()` |
| `prisma/seed.ts` | Expanded `SAMPLE_TEMPLATE.layoutConfig` from empty zones to the documented A4 geometry/zone map |
| `prisma/schema.prisma` | Certificate / Signatory / Template models, plus `Certificate.grade` and `Certificate.programDuration` |
| `prisma/migrations/20261006120000_init/migration.sql` | **New** — baseline migration for the whole schema, so `migrate deploy` works (see §9) |
| `src/server/dal/certificates/certificates.dal.ts` | Maps grade/program duration into the PDF payload; enforces exactly 4 modules on issue and reissue |
| `src/lib/validators/certificates.ts` | Requires exactly 4 modules; optional `grade` / `programDuration` |
| `src/components/admin/certificates/CertificateForm.tsx` | Fixed four-row module list (no add/remove), grade and program-duration fields |
| `src/server/types/certificates.ts`, `src/server/dto/certificates.ts` | Carry grade and program duration through create/update/admin detail |
| `public/logo.png`, `public/logo-small.png` | Copied from the reference project, byte-identical |
| `.next/dev/types/validator.ts` | Stale generated file with malformed text — deleted |

**No existing tracked file was deleted by this work.** Tracked deletions present in the
working tree (`app/**`, `lib/app/**`, `darbar-computer-site semi.zip`) are pre-existing and
belong to an earlier `app/` → `src/app/` restructure unrelated to certificates.

---

## 4. Gates

All required gates pass.

| Gate | Command | Result |
|---|---|---|
| Tests | `npm test` | ✅ exit 0 — **11 files, 234 tests** |
| Lint | `npm run lint` | ✅ exit 0 — **0 errors**, 19 warnings (all pre-existing) |
| Typecheck | `npm run typecheck` | ✅ exit 0 — 0 errors |
| Build | `npm run build` | ✅ exit 0 — compiled successfully, all routes generated |
| Prisma | `npx prisma migrate status` | ✅ 1 migration found, **database schema is up to date** |
| Renderer parity | `tests/certificate-design-parity.test.ts` | ✅ 23 tests — byte-identical content stream vs the reference project |
| Smoke (live) | see §5 | ✅ pass |

The 19 lint warnings are pre-existing and unrelated to certificates. The ported
`certificateRenderer.ts` carries a file-scoped `eslint-disable` for `no-explicit-any`,
`no-require-imports`, `no-unused-vars` and `prefer-const`: it is reference code that
originated under `next/core-web-vitals`, which does not enforce those rules, and parity
requires it stay unedited.

**Certificate routes registered in the production build:**

```
ƒ /admin/certificates
ƒ /admin/certificates/[id]
ƒ /admin/certificates/new
ƒ /admin/signatories
ƒ /admin/templates
ƒ /verify/[token]
```

### Seed data — verified against the live database

`prisma/seed.ts` → `seedCertificates()` is guarded and idempotent:

```ts
if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") { /* skip */ }
```

| `NODE_ENV` | `SEED_FORCE` | Seed runs |
|---|---|---|
| `production` | unset | no (skipped) |
| `production` | `1` | yes (explicit override) |
| `development` | unset | yes |

Idempotency was **proven, not assumed** — the seed's match keys were replayed twice
against the real database:

```
counts   before: 2 signatories / 1 template
         pass 1: 2 / 1
         pass 2: 2 / 1
row identities stable across two passes: true
IDEMPOTENT: true
```

Live reference data (no personal information — role labels only):

| Signatory | Title | Order |
|---|---|---|
| Institute Director | Executive Director | 0 |
| Program Coordinator | Academic Coordinator | 1 |

| Template | Version |
|---|---|
| Darbar Standard A4 Landscape | 1.0 |

Duplicate `(name, version)` template groups: **0**.

---

## 5. Smoke Verification

Performed against a production build (`next start`) on port **3111** — port 3000 was
occupied by an unrelated project, so an earlier 500 from `text-brand-text` came from
`C:\Users\Nepal\Desktop\Projects\Reasons\Reason_Production`, **not** this codebase.

### Public verification — invalid tokens

| Request | Status | Verdict |
|---|---|---|
| `/verify/invalidtoken1234567890` | 200¹ | ✅ generic not-found UI |
| `/verify/short` | 200¹ | ✅ generic not-found UI |
| `/verify/aaaa…` (40 chars) | 200¹ | ✅ generic not-found UI |

¹ **Framework-documented behavior, not a defect.** The segment streams (it has
`loading.tsx`), and Next.js returns `200` for streamed responses because headers are
already flushed before `notFound()` throws. Per
`node_modules/next/dist/docs/.../loading.md`:

> "When streaming, a `200` status code will be returned… Because the response headers have
> already been sent to the client, the status code of the response cannot be updated… when
> a 404 page is streamed, Next.js includes a `<meta name="robots" content="noindex">` tag."

Verified the mitigation is present: `<meta name="robots" content="noindex, nofollow">`.
Content assertions on the invalid-token body:

- ✅ "Certificate not found or invalid" renders
- ✅ "could not locate a valid certificate" renders
- ✅ Certificate card markers **absent** (no data leaked)
- ✅ Token appears **only** in the RSC route segment, `rel="canonical"`, and `og:url` —
  i.e. only the requester's own URL, never third-party data

To force a hard `404`, the token check must run in `proxy.ts` before streaming. This was
not done because it would remove the deliberate loading skeleton; `noindex, nofollow` is
the framework-sanctioned control.

### Admin routes — unauthenticated

All certificate and existing admin routes correctly return **307** redirect to login:

```
307 /admin/certificates          307 /admin/certificates/new
307 /admin/certificates/[id]     307 /admin/signatories
307 /admin/templates             307 /admin/courses
307 /admin/leads                 307 /admin/media
307 /admin/settings
```

### Public pages — regression check

```
200 /    200 /courses    200 /about    200 /contact    200 /admin/login
```

---

## 6. Privacy & Security

### Public verification exposes approved fields only

`PublicVerifyView` / `mapToPublicVerify()` return: certificate number, status, recipient
name, course name, issue date, issued/revoked/reissued dates, issued signatory name +
title, verification URL, and module order/title/subtitle.

**Never exposed:** phone, email, address, national ID, date of birth, guardian details,
payment information, internal database IDs, attendance, remarks, assessment scores,
admin notes, or audit metadata.

### Unpublished certificates cannot leak

`getPublicCertificateByToken()` filters status to `ISSUED | REVOKED | REISSUED | EXPIRED`.
`DRAFT` and `PENDING_ISSUE` are therefore unreachable publicly. Confirmed the
unfiltered admin mapper `getCertificateByToken()` is **not** referenced by the public route
or `VerificationCard`.

### Mutation chain verified on all 10 certificate mutations

Every action follows `requirePermission()` → Zod `safeParse` → DAL write → `audit()` →
`invalidate()`:

create · update · issue · reissue · revoke · delete certificate ·
save/delete signatory · save/delete template.

Audit entries use the established dotted convention (`certificate.issued`,
`signatory.updated`, …) and record no recipient PII.

### Server/client boundaries

- `import "server-only"` present on all DAL and action modules.
- The action barrel intentionally omits it (client components import server actions).
- No `src/server/*` import reaches a client component.
- Pages call DAL functions only — no direct `db.*` access.
- PDF/action error logs are sanitized (ids and slugs only, never names, phones, emails,
  or message bodies).

---

## 7. Defects Found During Runtime Verification

The certificate flow was exercised against the live database, a real render, and a real
issue → reissue → download cycle in the browser. That surfaced seven defects that static
review had missed. All are fixed and covered by regression tests.

Defects 7.2 through 7.5 were found in the **original HTML/Playwright renderer**, which has
since been replaced by the reference `pdf-lib` port. They are retained here because they
document why that renderer was not acceptable and are a hazard for any future HTML-based
approach. They no longer have any code in the repository.

### 7.1 Draft creation rejected nullable fields

`zodResolver` emits `null` for empty optional inputs. Server actions re-parse that output
with the same schema, so any field typed non-nullable on the way *in* rejected its own
normalised form.

| Field | Symptom | Fix |
|---|---|---|
| `certificateNumber`, `verificationToken` | required in Prisma but only assigned at issue | `String? @unique` |
| `recipientIdNumber` | draft create rejected | `.nullish()` / `optionalText()` |
| `templateId`, `layoutConfig`, dates | same, on templates and signatories | optional/nullish unions |

### 7.1a Issuing failed for every certificate (Zod 4 optional-key semantics)

Issuing returned a generic "Please fix the highlighted fields" with **no field marked and
no server log line**, because the failure happened in `safeParse` before any `fail()` path
logged anything. The row stayed `DRAFT` and no `certificate.issue` audit entry was written.

```
issuedSignatories.0.id: Invalid input: expected nonoptional, received undefined
```

Root cause is a Zod 4 behaviour, not a typo. Under Zod 3 a `z.union([..., z.undefined()])`
member makes the **key** optional; under Zod 4 it only makes the **value** acceptable while
the key is still required:

| Schema | `{ }` (key absent) |
|---|---|
| `z.string().optional()` | pass |
| `z.union([z.string(), z.undefined()])` | **fail** |
| `z.union([...]).transform(...)` | **fail** |
| `z.union([...]).optional().transform(...)` | pass |

`optionalCuidOrEmpty` / `optionalCuid` were built as the third row, and the admin signatory
selector's rows only carry `signatoryId` — there is no `id` field to send, so the key was
simply absent. The fix moves `.optional()` outside the union:

```ts
const optionalCuidOrEmpty = z
  .union([cuidLike, z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" ? value : ""));
```

`CertificateDialogs.tsx` now also sends `id: ""` explicitly in the issue and reissue
payloads, so client and server agree on the shape either way. Seven regression tests in
`tests/certificates.test.ts` pin the contract that nested optional keys may be **omitted**,
not merely present-and-undefined; reverting the validator change fails six of them.

Note the same latent pattern applies to any other schema built with a bare
`z.union([...z.undefined()])` in this codebase.

`mapToPublicVerify()` now renders `certificate.certificateNumber ?? ""` for drafts, which
are never reachable through the public route anyway (only `ISSUED` rows are).

### 7.2–7.5 HTML renderer defects (code since deleted)

Recorded for reference only — these were in `renderers/layout.ts` and its helpers, which
were removed when the pipeline moved to the reference `pdf-lib` engine.

- **7.2** Playwright rejected `"deviceScaleFactor" option is not supported with null
  "viewport"`.
- **7.3** The watermark zone hardcoded `font-family="Arial, sans-serif"`, forcing an extra
  system-font embed.
- **7.4** `cssFontFamily()` returns a **double-quoted** stack, and interpolating it into
  `style="…"` closed the attribute at the first inner `"`. Everything after it was silently
  discarded as stray text, so module numerals, titles, and subtitles lost `font-size`,
  `font-weight`, `color`, `letter-spacing`, `text-align` and `text-overflow`. No build or
  lint error. Fixed with `escapeHtml(cssFontFamily(family))`.
- **7.5** `fitName()` shrank type by character count only, never against the band height, so
  roughly 145 px of the recipient's name was clipped by `overflow: hidden` — and because no
  Cormorant glyphs survived, that font was never embedded.

The root problem shared by all four: an HTML/CSS renderer depends on a browser, on
attribute quoting, and on CSS overflow semantics. The reference `pdf-lib` engine has none of
those failure modes and is reproduced byte-for-byte here (§2.1).

### 7.6 Generated PDFs could not be downloaded

Two separate defects, both surfaced by issuing a real certificate in the UI and then
clicking **Download**.

**(a) Stored URL was pinned to the configured site origin.**
`persistCertificatePdf()` built the stored URL as
`resolveOfficialDomain() + "/uploads/certificates/…"`. The file is served by whichever
origin served the page, so any mismatch between the running server and
`NEXT_PUBLIC_SITE_URL` produces a dead link. In development this reproduced directly:
the app was served from `localhost:3001` while `.env` still declared
`NEXT_PUBLIC_SITE_URL="http://localhost:3000"`, so the stored link pointed at a
*different application* and returned `404`.

The PDF itself was always generated correctly — only the link was wrong.

`persistCertificatePdf()` now returns the root-relative path:

```ts
const relUrl = `${LOCAL_PDF_URL_PREFIX}/${sub}/${fileName}`;
return { ok: true, pdfUrl: relUrl };
```

Every consumer already renders it as a plain anchor `href`, and a root-relative href
resolves against the current origin, so all admin download/preview links and the public
verification page work unchanged on any port or host.

`resolveOfficialDomain()` is intentionally still used for the **canonical verification
URL** embedded in the QR code — that value must stay absolute and stable so the QR
decodes to the official domain.

**(b) The admin UI accepted arbitrary text as a PDF URL.**
The regenerate action validated `pdfUrl` only as `z.string().trim().min(1).max(500)`, so
free text was accepted and persisted verbatim. A value of `mohan` was stored, and because
the link is a bare relative reference the browser resolved it against the current path to
`GET /admin/certificates/mohan` → `404`.

Regeneration now rejects anything that is not a site path or an HTTP(S) URL:

```ts
pdfUrl: z.string().trim().max(500).optional().refine(
  (v) => v === undefined || v === "" || /^\//.test(v) || /^https?:\/\//i.test(v),
  { message: "PDF URL must be a path starting with / or an http(s) URL" }
)
```

### Existing rows repaired

Two certificates had already been issued with unusable values and were corrected in
place (no data was deleted or reissued):

| Certificate | Before | After |
|---|---|---|
| `DT-CERT-2026-80982` (ISSUED) | `http://localhost:3000/uploads/…` → 404 | `/uploads/…` → **200 `application/pdf`, 47 787 bytes** |
| `DT-CERT-2026-26877` (REISSUED) | `mohan` | `null` — superseded by `DT-CERT-2026-80982`, so no PDF is offered |

A `REISSUED` row holding `null` is correct: the reprint lives on the successor
certificate, so the detail panel simply omits the Download button.

### Regression coverage

`tests/certificate-pdf-persist.test.ts` adds 6 tests that pin the behaviour with
`NEXT_PUBLIC_SITE_URL` deliberately set to a *wrong* origin (`tests/stubs` and the
served-port case both included):

- stored URL starts with `/uploads/certificates/`
- stored URL is not absolute and never contains the configured origin
- the file the URL points at actually exists on disk and is non-empty
- the advertised date sub-directory matches the real one
- two PDFs for the same certificate get distinct filenames
- `../../etc/passwd` in a recipient name is neutralised and stays inside `uploads/`

Mutation check — restoring the old absolute-URL form fails **4 of 6** tests. The suite
also cleans up its own files, so neither a failing nor a mutated run can litter
`public/uploads/`.

**Live end-to-end confirmation** against the running dev server:

```
GET /uploads/certificates/2026-10-06/DT-CERT-2026-80982-….pdf
  → 200  Content-Type: application/pdf  47 787 bytes  header %PDF-
GET /verify/1W6Mz13AJ5s1K6VZ0WyLIT0_
  → 200  renders DT-CERT-2026-80982
```

---

## 8. PDF Output Verification

### 8.1 Design parity — the authoritative check

The ported renderer was run against the reference project's own payload and its output was
compared stream by stream. This is the check that matters, because it compares against the
**intended design** rather than against an expectation written here:

| Property | Reference project | This repo |
|---|---|---|
| Bytes | 3 107 159 | 3 107 158 |
| Page content stream | 1 314 232 chars, FNV-1a `831d420f` | **identical** |
| Streams | — | 18 of 19 identical |
| Difference | — | `/CreationDate` and `/ModDate`, 27 s apart |

Every drawing operation, every text position, every font subset, the watermark, and the
QR image are byte-identical. The renderer is not a reimplementation; it is the reference
engine.

### 8.2 Output properties

Checked on the same PDF, asserted continuously by `tests/certificate-design-parity.test.ts`:

| Property | Result |
|---|---|
| Generation | `ok: true`, ~1 s |
| Header | `%PDF-1.7` |
| Page size | 841.89 × 595.28 pt — A4 landscape, exact |
| Pages | 1 |
| Fonts | Montserrat + Cormorant Garamond, subset-embedded as `FontFile2` |
| Missing-font warnings | 0 — all six shipped TTFs resolve |
| `/Producer` | `DarbarTech Certificate Engine` |
| `/Creator` | `DarbarTech Certificate System` |
| `/Title` | `Certificate DT-CERT-2026-00125` |

Note for anyone asserting on metadata: `PDFDocument.load()` defaults to
`updateMetadata: true`, which **overwrites** `/Producer` and `/Creator` with pdf-lib's own
values. The suite passes `{ updateMetadata: false }` to read what the engine actually wrote.

### 8.3 Four-module rule

The v2 template hard-codes `module1Title` … `module4Title`, so it only has a correct layout
for exactly four modules. Enforced in three places:

- `certificateWriteSchema` rejects a draft save that does not have exactly 4.
- `CertificateForm` always renders exactly 4 rows; the add/remove controls are gone.
- `toCertificateRenderInput()` returns an error instead of dropping or overflowing a row.
- `issueCertificate()` and `reissueCertificate()` re-check the count in the DAL, covering
  rows written before the rule existed and any caller that bypasses the form.

Both existing certificates have 3 items and are `null` for grade and duration, so they now
correctly **refuse** to regenerate. Their already-generated PDFs are untouched. Giving them
a fourth module is a data decision, not a code one.

---

## 9. Known Limitations

1. **Playwright is still a dependency for e2e tests only.** The PDF pipeline no longer uses
   it. The NFT advisory it used to cause during the build is gone; the package remains for
   `npm run test:e2e`.
2. **Broad public cache invalidation.** `getPublicCertificateByToken()` is cached with the
   static tag set `PUBLIC_VERIFY_TAGS = ['certificates', 'certificates:list', 'verify']`.
   Writes emit a per-token tag `certificate:verify:<token>`, but that tag is not attached
   to the cached entry, so any certificate write flushes the whole public verify cache.
   Correct, just not granular. Fixable with a token-parameterised cache factory.
3. **QR round trip is still unverified visually.** A real issued certificate was requested
   over HTTP: `GET /verify/<live-token>` → `200`, and its stored PDF path → `200
   application/pdf`. The QR payload is constructed from the canonical
   `resolveOfficialDomain()` value and the PDF embeds it, but the **decoded** QR was not
   scanned. Recommended follow-up: decode the QR from a generated PDF and assert it
   resolves to the production verify URL.
4. **PDF generation is detached and its failures are invisible to the user.** Issue and
   regenerate return as soon as the row is written; `schedulePdfGeneration()` then renders
   the PDF out of band and only `console.error`s on failure. A user can therefore see
   "Issued" with no PDF and no Download button, and only the server log explains why.
   A production build should move this to a durable queue with a retry and a visible
   failure state on the certificate row.
5. **`getCertificateByToken()` is unused** — an exported admin-DTO mapper with no callers.
   Harmless; remove or wire up when an admin deep-link needs it.
6. **`prisma/` is still untracked in git.** The baseline migration now exists and is applied
   locally (`prisma/migrations/20261006120000_init`, marked via `prisma migrate resolve
   --applied`), but the directory must be added to version control before `migrate deploy`
   can work anywhere.
7. **`server-only` is not a declared dependency.** Next.js resolves it at build time,
   Vitest aliases it to `tests/stubs/server-only.ts`, and the repo's own
   `scripts/tsconfig.scripts.json` aliases it to `scripts/stubs/server-only.ts` — so
   `npm run verify:seed` and `npm test` both work. Ad-hoc `npx tsx scripts/…` invocations
   that bypass the tsconfig will fail to resolve it; use the npm scripts.
8. **`scripts/verify-seed.ts` has no certificate coverage.** It validates courses,
   categories, groups, and site settings only. Certificate seed idempotency was verified
   by replaying the match keys against the live database (§4); wiring it into the standing
   script would be a reasonable follow-up.
9. **`verify:seed` reports 6 pre-existing failures** in course/category content (a category
   count of 17 vs 15, one slug mismatch, one course-timing label, and two group/category
   sets). These are unrelated to certificates and predate this work.
10. **Both existing certificates have 3 modules, not 4.** They predate the four-module rule,
    so regeneration is now correctly refused for them. Their stored PDFs still download. A
    fourth module plus grade/program duration must be entered through the admin form before
    either can be reprinted.

---

## 10. Rollback

The feature is isolated and reversible.

1. **Remove routes** — delete `src/app/verify/`, and the `certificates`, `signatories`,
   `templates` admin route directories.
2. **Remove components** — delete `src/components/verify/` and
   `src/components/admin/certificates/`.
3. **Remove server code** — delete `src/server/dal/certificates/`,
   `src/server/actions/certificates/`, `src/server/certificates/`, and
   `src/lib/validators/certificates.ts`.
4. **Revert edits** — `git checkout -- package.json tsconfig.json eslint.config.mjs
   src/server/revalidate.ts`.
5. **Drop the tables** (destructive — also discards issued certificates):
   `DROP TABLE "CertificateIssuedSignatory"; DROP TABLE "Certificate"; DROP TABLE
   "CertificateTemplate"; DROP TABLE "CertificateSignatory";`
6. **Orphaned media** — `public/uploads/certificates/**` may be removed; the directory is
   gitignored.

No other feature reads these tables, so no further cleanup is required.

Note: the baseline migration covers the **whole** schema, not just certificates, because
`prisma/migrations/` did not previously exist. Rolling back the certificate feature means
leaving that migration in place and dropping the tables as above.

---

## 11. Pre-Deploy Checklist

- [x] `npm run test:e2e:install` — Chromium installed
- [x] Confirm the renderer matches the reference design — page content stream byte-identical,
      18 of 19 streams identical, only timestamps differ (§8.1)
- [x] Confirm the output is a parseable single-page A4-landscape PDF, 841.89 × 595.28 pt, with
      Montserrat and Cormorant subset-embedded and no missing-font warnings (§8.2)
- [x] Confirm the four-module rule is enforced in the validator, the form, the render
      adapter, and on issue/reissue (§8.3)
- [x] Download a PDF from the admin UI and from `/verify/<token>` — confirmed
      `200 application/pdf`, `%PDF-` header (§7.6)
- [x] Request `/verify/<token>` over HTTP with a live issued token — `200` (§9.3)
- [x] Generate and apply the baseline migration — `prisma migrate status` reports the schema
      is up to date
- [x] Move cache invalidation out of detached PDF work — added `invalidateDetached()`, which
      uses `revalidateTag(tag, 'max')`, the documented API outside a Server Action
- [ ] Scan the produced QR and confirm it opens the matching `/verify/<token>` page
- [ ] Move PDF generation to a durable queue with retry and a visible failure state (§9.4)
- [ ] Add `prisma/` to version control so `migrate deploy` can run (§9.6)
- [ ] Add a `prisma generate` + `prisma migrate deploy` step to CI — `docs/08` specifies it
      but `.github/workflows/ci.yml` does not run either
- [ ] Enter a fourth module, grade, and program duration for `DT-CERT-2026-80982` and
      `DT-CERT-2026-26877` if they are ever to be reprinted (§9.10)
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` has no trailing slash (a double-slash URL bug was fixed
      during hardening, but the value is environment-supplied)
- [ ] Point `NEXT_PUBLIC_SITE_URL` at the port the app is actually served on in development —
      it now only affects the canonical verification/QR URL, but a wrong value still bakes a
      bad QR target (§7.6)
- [ ] Set a production `BETTER_AUTH_SECRET` of at least 32 random characters — the build
      logs a low-entropy warning against the current value
- [ ] Seed once in the target environment with `SEED_FORCE=1` if reference data is wanted
- [ ] Confirm `MEDIA_STORAGE_PROVIDER` is `local` and `public/uploads/certificates/` is
      writable, or configure Cloudinary — otherwise PDFs generate but are not persisted
