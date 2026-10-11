# DarbarTech Programmable Certificate System — Engineering & Design Audit
**Scope:** Full codebase review (Next.js 14 App Router, TypeScript, Zod, Supabase + in-memory fallback DB, pdf-lib renderer).
**Reviewed as:** Senior Software Engineer + Senior Product Designer + Engineering Manager.
**Date of audit:** 2026-09-15

---

## 1. What this system actually is

A Next.js 14 app that lets DarbarTech staff issue, preview, verify, and (in the backend only) revoke/reissue print-ready PDF certificates from a canonical course catalog. It has:

- A real auth layer (bcrypt + HMAC-signed session cookies, lockout, timing-safe compare) — **better than most internal admin tools**.
- A real validation layer (Zod schemas shared between client and server).
- A real rendering pipeline (pdf-lib + custom text-fitting engine + shape/QR layer) with an unusually mature design-parity discipline (see `Design Document/`, `CERTIFICATE_DESIGN_PARITY_*.md`, and the `check:brand-hex` build guard).
- A Supabase-backed persistence layer with an in-memory fallback for local dev.

The rendering/print engineering is the most mature part of the codebase. The **admin product surface (dashboard, certificate lifecycle management, course/signatory management) is the least mature part** — several backend capabilities exist with no UI to reach them at all, and the one form that does exist (Create Certificate) has real bugs and UX debt.

## 2. Headline findings

| # | Finding | Severity |
|---|---|---|
| 1 | A single transient Supabase error anywhere in the app permanently (until server restart) downgrades **all** certificate data for **all** users to non-persistent in-memory storage, silently. No admin-facing indicator. | 🔴 Critical |
| 2 | `db.certificates.update()` / `findById()` can return `null` on a Supabase error without falling back or failing loudly; `issueCertificate()` then dereferences it with a non-null assertion (`targetCert!.id`) → a transient DB hiccup **during issuance** can crash the request after the PDF has already been generated and stored, or worse, report success with a null certificate. | 🔴 Critical |
| 3 | Certificate numbering has a non-atomic fallback path (`count() + 1`) that can mint duplicate certificate numbers under concurrent issuance if the atomic RPC path errors. | 🟠 High |
| 4 | Revoke and Reissue are fully built server-side (schema, service, API route, API client method) but **there is no UI anywhere to trigger them.** Once issued, a certificate cannot be revoked or corrected from the dashboard. | 🟠 High (product gap) |
| 5 | There is no admin UI to create/edit courses or signatories, despite the backend supporting it and a `manageTemplates` permission already being granted to `super_admin`. | 🟠 High (product gap) |
| 6 | The rate limiter meant for admin API routes (`validateRateLimit`, explicitly commented "for authenticated admin API routes") is never actually applied to any `/api/admin/*` route — only to public verification endpoints. Issuance/revocation endpoints are unthrottled. | 🟠 High (security) |
| 7 | `/admin` is not a dashboard — it's a redirect straight to the certificate table. There's no at-a-glance operational view (issued this month, revoked, drafts abandoned, course usage, recent activity). | 🟡 Medium (product) |
| 8 | The Create Certificate form has a leftover render-time `setState` call, a course-lock UX that silently discards user edits, and no autosave/recovery for a form long enough to lose real work to a refresh. | 🟡 Medium |
| 9 | Certificate list has no search, no client-visible pagination controls (hardcoded `limit: 50`), and no way to open a certificate's detail/audit trail. | 🟡 Medium |
| 10 | Design-token discipline (`brand.gold` etc. in `tailwind.config.ts`, enforced for templates by `scripts/checkBrandHexLiterals.ts`) is **not** enforced or followed in the admin UI itself — several inline hex literals duplicate tokens that already exist. | 🟢 Low |

Full details, file/line references, and reasoning for each are in **`01_BUG_REPORT.md`**.

## 3. What's genuinely good (keep doing this)

- The auth service's attention to timing-safe comparisons, generic error messages, and lockout is genuinely senior-level work — don't let a redesign regress it.
- The `data_snapshot` envelope pattern (snapshotting course + input data on every issuance) is exactly right for a legal/certificate-of-record system — reissue logic depends on it and it's well-reasoned.
- The comments throughout `certificateService.ts` and `database/index.ts` explaining *why* a fix exists (e.g. the "empty array is a legitimate result" fix for `courses.list`) show real production incident learning. That institutional memory is valuable — the fixes proposed in this audit are written in the same spirit and should keep those comments intact or extend them.
- The text-fitting / module-fit-check system that blocks preview generation client-side before ever hitting the renderer is a good defensive pattern and should be the template for how other structural constraints (e.g. course/module consistency) surface to the admin.

## 4. Document index

| File | Contents |
|---|---|
| `01_BUG_REPORT.md` | Every bug found, with severity, file/line, root cause, and concrete fix |
| `02_DASHBOARD_REDESIGN.md` | New `/admin` home dashboard: layout, widgets, data contract |
| `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` | Create Certificate form fixes + redesign; new Certificate Detail / Revoke / Reissue UI; Course & Signatory management UI |
| `04_BACKEND_RELIABILITY_AND_SECURITY.md` | DB circuit breaker, numbering atomicity, rate limiting, RBAC, audit trail improvements |
| `05_IMPLEMENTATION_ROADMAP.md` | Prioritized, sequenced plan with rough effort sizing |

Read `01_BUG_REPORT.md` first — everything else builds on it.
