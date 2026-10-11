# Bug Report — DarbarTech Certificate System

Severity key: 🔴 Critical (data integrity / crash / security) · 🟠 High · 🟡 Medium · 🟢 Low / polish.

Each entry: **Where → What → Why it matters → Fix.**

---

## 🔴 CRIT-1 — Supabase circuit breaker degrades the whole app permanently on one error

**Where:** `src/lib/database/index.ts`, `tripCircuit()` / `usingSupabase()` (lines ~32–50).

**What:** The very first time *any* Supabase call throws (network blip, cold start timeout, a single malformed row, RLS misconfiguration, whatever), `SUPABASE_UNHEALTHY` is set to `true` **module-wide**. From that point on, `usingSupabase()` returns `false` for *every* table and *every* operation, for the lifetime of the server process — there is no retry, no half-open state, no TTL.

```ts
const tripCircuit = (operation: string, err: unknown) => {
  ...
  SUPABASE_UNHEALTHY = true;          // <-- global, permanent, no reset
  void seedDefaultData().catch(() => undefined);
};
```

**Why it matters:** This is a certificate-of-record system — the entire point of Supabase is durable, auditable storage. If a single transient error occurs (very plausible in serverless/cold-start environments), the app **silently** starts writing every subsequently "issued" certificate to an in-memory Map that:
- is wiped on every deploy/restart/scale-to-zero,
- is not shared across serverless instances (so certificate #DT-CERT-2026-00042 issued on instance A doesn't exist on instance B — verification links can 404 depending on which instance serves the request),
- gives no signal to the admin that this has happened. The UI just keeps working.

An admin could issue 50 real certificates, all of which are gone the next time the app scales or redeploys, with zero indication anything was wrong.

**Fix:**
1. Make failures **operation-scoped**, not global — a failure listing courses should not stop certificate writes from going to Supabase.
2. Replace the permanent boolean with a short-TTL half-open circuit (e.g. re-attempt Supabase after 30–60s, per operation family) — standard circuit breaker pattern.
3. Surface health state to the admin UI: expose `GET /api/admin/health` (already have the pieces — just read `SUPABASE_UNHEALTHY`/a per-operation map) and render a persistent banner in `AdminLayout` when degraded: *"⚠ Running in degraded/offline mode — certificates issued now will not be saved permanently. Contact engineering."* This alone converts a silent data-loss bug into a visible, actionable one.
4. Log to an external channel (not just `console.warn`) on trip — this is a page-someone event, not a log line.

---

## 🔴 CRIT-2 — Non-null assertions on DB calls that can legitimately return `null`

**Where:** `src/lib/services/certificateService.ts`, `issueCertificate()` (~line 300–368); also `src/app/api/admin/certificates/[id]/issue/route.ts` and `reissue/route.ts` (`result.certificate!.id`).

**What:**
```ts
targetCert = await db.certificates.update(draftId, { ...status: "ISSUED"... });
...
await logEvent(targetCert!.id, "ISSUED", ...);   // crashes if update() returned null
return { success: true, certificate: targetCert!, modules };  // "success" with a null certificate
```
`db.certificates.update()` (in `database/index.ts`) returns `null` whenever the Supabase call errors (`if (error) return null;`) **without** throwing and **without** tripping the circuit breaker or falling back to in-memory. So this is a real, reachable path, not a theoretical one.

**Why it matters:** By the time this line runs, the PDF has **already been rendered and saved to storage** (`storageService.savePdf` a few lines above). If the subsequent DB update fails:
- `logEvent(targetCert!.id, ...)` throws a `TypeError` on `null.id`, the request 500s, the admin sees "Issuance failed" — **but a PDF now exists in storage with a certificate number that has no corresponding (or a stale DRAFT) database record.** The certificate number sequence has also already been consumed, so it can never be reused, but no valid certificate is retrievable under it.
- If it doesn't throw (e.g. some other code path returns non-null but stale data), the function can return `{ success: true, certificate: null }`, which the API route then does `getCertificateWithModules(result.certificate!.id)` on — another crash.

**Fix:**
1. In `database/index.ts`, make `update()`/`findById()` distinguish "not found" (`PGRST116` / 0 rows) from "genuine error." On genuine error, throw (so the caller's `try/catch` or the circuit breaker actually engages) instead of silently returning `null`.
2. In `certificateService.issueCertificate()`, treat a null/failed `update()` after a successful PDF render as its own failure mode: log it loudly (this is now an orphaned PDF — needs manual reconciliation or a cleanup job), return a clear error to the admin ("Certificate content generated but could not be saved — do not retry with the same data until this is resolved"), and avoid the non-null assertions — check and branch explicitly.
3. Add a lightweight reconciliation script/admin tool that finds storage keys with no matching certificate record (see `05_IMPLEMENTATION_ROADMAP.md`).

---

## 🟠 HIGH-1 — Certificate/Student numbering fallback is not atomic

**Where:** `src/lib/database/index.ts`, `numbering.nextNumber()` (~line 526–547).

**What:** The primary path calls a Postgres RPC (`next_certificate_number`) which is presumably atomic. But if that RPC errors for any reason, the fallback is:
```ts
const { count } = await supabaseAdmin!.from("certificates")
  .select("certificate_number", { count: "exact", head: true })
  .like("certificate_number", `${key}-%`);
return (count || 0) + 1;
```
This is a classic **read-then-increment race**. Two concurrent issuance requests hitting the fallback path at the same time can both read `count = 41` and both mint `DT-CERT-2026-00042`.

**Why it matters:** Certificate numbers are asserted elsewhere in the codebase (`validateCertificateNumberFormat`, the manual verification flow) to be unique identifiers of record. A duplicate breaks manual verification lookup (`findByNumber` returns whichever one happens to match first) and is a real compliance problem for a certificate-issuing organization.

**Fix:** Don't fall back to a non-atomic read at all. If the RPC errors, that's a "the number sequence is unavailable" state — fail the issuance with a clear error rather than silently degrading correctness. (Contrast with CRIT-1/2: for *numbering*, correctness > availability — an admin retrying in 30 seconds is a far better outcome than a duplicate certificate number that surfaces months later.)

---

## 🟠 HIGH-2 — Revoke & Reissue exist in the backend with zero UI

**Where:** Backend: `src/app/api/admin/certificates/[id]/revoke/route.ts`, `.../reissue/route.ts`, `certificateService.revokeCertificate/reissueCertificate`, `apiClient.revokeCertificate/reissueCertificate`. Frontend: **nowhere** — `grep -rn "revoke\|reissue" src/app/admin` only matches the list/create pages using the words in disabled-state copy, not actual controls.

**What:** A fully-permissioned, fully-validated, fully-audited feature (including a `revoke` permission already differentiated per-role in `AdminUser.permissions`) is unreachable by any admin, including `super_admin`. Once a certificate is `ISSUED`, the dashboard offers exactly two actions: Download and Verify.

**Why it matters:** Every certificate system needs a correction path — recipient name typo, wrong program, wrong signatory, fraud discovered after the fact. Right now the only way to fix any of that is a direct API call (`curl`/Postman) by someone with the session cookie, which is both an operational bottleneck and a security smell (bypassing the audited UI path encourages ad-hoc scripting against a legal-document system).

**Fix:** Build the certificate detail page + Revoke/Reissue dialogs. Full spec in `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` §2–3.

---

## 🟠 HIGH-3 — No UI for course/signatory management

**Where:** Backend: `POST /api/admin/courses`, `POST /api/admin/signatories` (both gated on `manageTemplates` permission, which `super_admin` already has). Frontend: none — courses/signatories are only ever *read* (as `<select>` options) in the Create Certificate form.

**What:** There's no page to add a new course to the catalog, edit an existing course's modules, deactivate a course, or add a new signatory. The only way data gets into `courses`/`signatories` is the hardcoded seed (`courseCatalogSeed.ts`, `seedDefaultData()`) or a raw API call.

**Why it matters:** This is the single biggest gap between "backend capability" and "usable product." As soon as DarbarTech adds a new training program, whoever operates this system has no way to make it available in the Create Certificate dropdown without a code deploy or a manual API call.

**Fix:** Build `/admin/courses` and `/admin/signatories` management pages. Full spec in `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` §4–5.

---

## 🟠 HIGH-4 — Admin rate limiter is defined, documented, and never used

**Where:** `src/lib/middleware/auth.ts`:
```ts
// General-purpose limit for authenticated admin API routes.
export const validateRateLimit = createRateLimiter(30, 60 * 1000);
```
Actual usage (`grep -rn "validateRateLimit" src/app/api/`): only `verify/[token]/route.ts` and `verify/manual/route.ts` — both **public**, unauthenticated endpoints. Not one `/api/admin/*` route imports it.

**Why it matters:** The comment states the intent explicitly, so this isn't a deliberate design choice that was later mis-documented — it's a limiter that was built for a purpose and never wired in. Every authenticated mutation endpoint (create, preview, issue, revoke, reissue, download) currently has **no** throttling. A leaked/stolen session cookie (XSS, shared machine, etc.) can be used to script unlimited issuance/revocation calls.

**Fix:** Apply `validateRateLimit(getClientIp(req) + ':' + user.id)` inside `withAdminAuth` itself (one call site, applies everywhere) rather than per-route, so new routes get it automatically. Consider a stricter, separate bucket for `issue`/`revoke`/`reissue` specifically, since those are the highest-consequence actions.

---

## 🟡 MED-1 — Render-time `setState` call left in the Preview stage

**Where:** `src/app/admin/certificates/new/page.tsx`, line 451:
```tsx
{moduleFitIssues.length > 0 && setModuleFitIssues(moduleFitIssues) !== undefined && null}
```

**What:** This calls `setModuleFitIssues` **during JSX render**, expecting the `&&` chain to hide the result, with no visible purpose (`moduleFitIssues` is already in scope; nothing reads the return value; the state is set to a reference-equal copy of itself). This is a debugging leftover, not intentional logic — the surrounding code already renders `previewErrors` (which is populated from the same `moduleFitIssues` list one function up) for the actual warning banner.

**Why it matters:** Calling a state setter unconditionally in the render body is a React anti-pattern. It currently "works" only by accident, because `setModuleFitIssues(moduleFitIssues)` passes the exact same array reference back to itself, so React's `Object.is` bail-out prevents a re-render loop. **The moment anyone touches this code** (e.g. changes `moduleFitIssues` to be recomputed inline, or memoizes it differently), this becomes an infinite re-render / "Maximum update depth exceeded" crash with a very confusing stack trace, because the trigger line looks like inert JSX.

**Fix:** Delete the line. It has no effect today; keeping it is a landmine for the next person who touches this file.

---

## 🟡 MED-2 — Course-lock silently discards manually-entered data

**Where:** `src/app/admin/certificates/new/page.tsx`, `handleCourseSelect()` (~line 126).

**What:** Selecting a course after the admin has already typed a program title/duration/modules **overwrites those fields with no confirmation**. Conversely, switching *away* from a course (`courseId === ""`) resets program/modules to blank, discarding whatever was there before the course was picked — even if the admin had started filling them in manually first and only picked a course to "check something."

**Why it matters:** Admin data-entry forms should never destroy typed input without at least a confirmation step, especially on a form this long (recipient, program, 4 modules, grade, two signatories). This is a classic "I lost 3 minutes of work" complaint waiting to happen.

**Fix:** If any of the program/module fields are non-empty and a different course is selected (or "none" is selected), show a small inline confirm ("Switching courses will replace the program details below. Continue?") before applying `handleCourseSelect`. Trivial to add as a `window.confirm` in the short term; a proper inline dialog is better (see `03_ADMIN_FORM_AND_LIFECYCLE_UX.md`).

---

## 🟡 MED-3 — No draft autosave / recovery on the Create Certificate form

**Where:** `src/app/admin/certificates/new/page.tsx` — `formData` lives entirely in React state; a `createDraftCertificate` call only happens at the *end* of the form, on submit (`goToPreview`).

**What:** A long, multi-section form (recipient → course/program → 4 modules → grade/dates → 2 signatories) has no autosave. A browser refresh, an accidental back-navigation, or a session-expiry redirect (which `AdminLayout` does automatically via the `dt-auth-expired` event) loses everything typed.

**Fix:** Debounce-persist `formData` to `sessionStorage` (or call the existing `createDraftCertificate` endpoint on a longer debounce once the minimum required fields are present) and offer to restore it ("You have an unsaved certificate draft for **Mohan Shahi** — Resume / Discard") when the page mounts and finds one.

---

## 🟡 MED-4 — Certificate list has no search, and pagination is invisible

**Where:** `src/app/admin/certificates/page.tsx`.

**What:** `apiClient.listCertificates({ limit: 50, status: statusFilter })` — the backend (`db.certificates.list`) already supports `offset`, and the API response already returns `pagination.total`, but the frontend never uses either. There's no way to see certificate #51+, and no way to search by recipient name, certificate number, or student ID (only a status dropdown).

**Fix:** Add a search input (debounced) wired to a new `q` query param on `GET /api/admin/certificates` (matching recipient name / certificate number / student ID case-insensitively), plus Prev/Next (or numbered) pagination using the `pagination.total` already returned. Full spec in `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` §1.

---

## 🟡 MED-5 — No certificate detail / audit-trail view

**Where:** Backend already returns everything needed — `GET /api/admin/certificates/[id]` returns `certificate`, `modules`, **and `events`** (the full audit trail via `getAuditTrail`). There is no frontend route (`/admin/certificates/[id]`) that calls it.

**Why it matters:** The audit trail (`CREATED`, `ISSUED`, `DOWNLOADED`, `VERIFIED`, `REVOKED`, `REISSUED` events with actor + metadata) is exactly the kind of thing an admin needs when a recipient disputes something ("who issued this, when, was it ever downloaded/verified") — and it's already being recorded and already has an endpoint. It's just not shown anywhere.

**Fix:** Build the detail page — spec in `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` §2.

---

## 🟢 LOW-1 — Hardcoded hex literals bypass the brand token system, in the admin UI itself

**Where:**
- `src/app/admin/certificates/page.tsx` line 144: `style={{ color: "#c9a227" }}` for the grade badge.
- `src/app/globals.css`, `.btn-gold`: `background-color: #c9a227;` instead of `bg-brand-gold`.

**What:** `tailwind.config.ts` already defines `brand.gold: "#c9a227"`. The codebase even ships a **build-time lint script** (`scripts/checkBrandHexLiterals.ts`) specifically to prevent hardcoded brand hex literals from drifting out of sync with the palette — but it only scans `src/lib/templates/`, not the admin UI, so these two admin-side instances slipped through.

**Why it matters:** Low risk today (the value matches the token), but it's exactly the failure mode the project's own tooling was built to catch: if `brand.gold` is ever recalibrated (the same reason `corporateBlue`/`teal`/`deepNavy` have both a `hex` and `hexSrgb` value in the palette — see the lint script's own comments about "BUG-11"), these two spots won't move with it.

**Fix:** `className="text-brand-gold"` and `@apply bg-brand-gold` respectively. Optionally widen `checkBrandHexLiterals.ts`'s `TEMPLATE_DIR` scan (or add a second invocation) to include `src/app/**` and `src/components/**` so this class of bug can't reappear anywhere in the UI, not just the render templates.

---

## 🟢 LOW-2 — Dead / unused validation schema for certificate-number format

**Where:** `src/lib/validation/schemas.ts`:
```ts
export const certificateNumberManualSchema = z.object({
  certificateNumber: z.string().trim().regex(/^DT-CERT-\d{4}-\d{5}$/, ...),
});
```
This hardcodes the `DT-CERT` prefix, but `numberingService.ts` derives the real prefix from `process.env.CERTIFICATE_PREFIX` (defaulting to `"DT-CERT"` only when unset). The route that actually handles manual verification search (`api/public/verify/manual/route.ts`) uses a *different* schema, `manualCertificateSearchSchema` (a bare non-empty-string check), so `certificateNumberManualSchema` is never imported or used anywhere.

**Why it matters:** Not a live bug (it's unreferenced), but it's a trap: if a future refactor "cleans up" validation by swapping the loose schema for this stricter one (a very natural-looking improvement), it will silently break manual verification the moment `CERTIFICATE_PREFIX` is changed from its default in any environment.

**Fix:** Either delete the dead schema, or fix it to build its regex from `CERTIFICATE_PREFIX` and actually wire it into the manual-verify route (tightening that endpoint's input validation is a reasonable improvement — see `04_BACKEND_RELIABILITY_AND_SECURITY.md`).

---

## 🟢 LOW-3 — Login lockout counter keeps incrementing after lockout, extending it indefinitely

**Where:** `src/lib/services/authService.ts`, `authenticateAdmin()`:
```ts
if (!user || !valid || isLockedOut(username)) {
  recordFailedAttempt(username);
  return null;
}
```
Once `count >= MAX_ATTEMPTS`, every *subsequent* attempt (even ones that would have had the correct password) still calls `recordFailedAttempt`, which recomputes `lockedUntil = Date.now() + LOCKOUT_MS` again since `count` is now always `>= MAX_ATTEMPTS`.

**Why it matters:** This means the 15-minute lockout **never actually expires** as long as anyone (attacker or legitimate confused user) keeps hitting the login endpoint during the lockout window — each attempt pushes `lockedUntil` further into the future. This is a mild self-inflicted denial-of-service: a legitimate admin who mistypes their password 5 times, then keeps trying every minute out of frustration, will never get back in without a server restart or waiting out a window that keeps resetting.

**Fix:** Don't call `recordFailedAttempt` while already locked out — just return the generic failure. Let the existing lockout expire on its own schedule.

---

## Summary table

| ID | Title | File(s) | Severity |
|---|---|---|---|
| CRIT-1 | Permanent silent DB fallback to in-memory | `database/index.ts` | 🔴 |
| CRIT-2 | Non-null assertions on nullable DB results | `certificateService.ts`, issue/reissue routes | 🔴 |
| HIGH-1 | Non-atomic numbering fallback | `database/index.ts` | 🟠 |
| HIGH-2 | Revoke/Reissue have no UI | `admin/certificates/*`, missing pages | 🟠 |
| HIGH-3 | Course/Signatory management has no UI | missing pages | 🟠 |
| HIGH-4 | Admin rate limiter unused | `middleware/auth.ts` | 🟠 |
| MED-1 | Render-time setState leftover | `admin/certificates/new/page.tsx` | 🟡 |
| MED-2 | Course-select silently discards typed data | `admin/certificates/new/page.tsx` | 🟡 |
| MED-3 | No draft autosave/recovery | `admin/certificates/new/page.tsx` | 🟡 |
| MED-4 | No search / usable pagination | `admin/certificates/page.tsx` | 🟡 |
| MED-5 | No certificate detail/audit-trail view | missing page | 🟡 |
| LOW-1 | Hardcoded brand hex outside templates | `admin/certificates/page.tsx`, `globals.css` | 🟢 |
| LOW-2 | Dead/unsynced validation schema | `validation/schemas.ts` | 🟢 |
| LOW-3 | Lockout window resets indefinitely | `authService.ts` | 🟢 |
