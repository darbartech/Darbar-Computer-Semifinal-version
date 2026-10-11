# PROMPT 06: Seed, Hardening & Final Verification — Specification

## Problem
The certificate system (Prompts 1–5) has DAL, actions, types, validators, PDF generation, and public/admin pages in place. The final phase must close it with non-production seeds, export structure hardening (barrels), RBAC/cache/PII boundary verification, integration sanity checks, build gates, and a completion report with evidence.

## Users / Stakeholders
- **Developers**: need idempotent seeds to stand up a working admin UI with signatory and template rows; need clean barrel exports for module-level imports.
- **Reviewers / Auditors**: need evidence that RBAC, cache invalidation, and PII boundaries are intact.
- **Release Manager**: needs three gates (lint, typecheck, build) all green with a report describing rollback readiness, limitations, and additive-only confirmation.

## Goals
1. Stand up `CertificateSignatory` (active primary + secondary) and `CertificateTemplate` (minimal active) rows non-destructively in non-production environments.
2. Guarantee clean module exports (barrel `index.ts` files) for the certificate DAL and actions, exporting types, Zod schemas, and DTOs where applicable.
3. Independently verify that every mutation has `requirePermission`, `audit()`, and `invalidate(tags)`; that no PII leaks into logs or client bundles; and that DTOs enforce PII boundaries on the public verify route.
4. Validate integration non-blocking PDF scheduling, cache tag coverage on issue/revoke/reissue, and DTO-only reads on the public verify page.
5. Pass the three required gates (`npm run lint`, `npm run typecheck`, `npm run build`) and record evidence plus rollback notes in a completion report.

## Non-Goals
- Do not modify any existing seed logic or remove existing rows in `prisma/seed.ts`.
- Do not introduce REST APIs; keep Server Actions + DAL flow intact.
- Do not alter public URLs, existing component visuals, or existing metadata/sitemaps.
- Do not commit any changes.
- Do not create any additional admin or public UI pages beyond what already exists.
- Do not add production seeds or real PII.

## Functional Requirements

### FR-1 — Seed: CertificateSignatory sample rows
- Add one additive block (or dedicated seed module) that upserts two `CertificateSignatory` rows keyed by a deterministic unique attribute.
- One signatory marked as primary (e.g., `displayOrder = 0`, `isActive = true`) and one as secondary (e.g., `displayOrder = 1`, `isActive = true`).
- Guard the entire certificate seed block with `NODE_ENV !== 'production'` (or equivalent); in production the block must be a no-op.
- Seed data must be generic/non-PII (institutional titles, no real names, no personal email/phone).
- Idempotent: re-running the seed must never duplicate rows; use `upsert` keyed uniquely.

### FR-2 — Seed: CertificateTemplate minimal row
- Add one additive `CertificateTemplate` row with a minimal A4-landscape-friendly `layoutConfig` (or `null` if the PDF layer supplies defaults).
- Use the unique `(name, version)` compound key for the upsert.
- Guard with the same non-production condition.
- Idempotent re-runs must keep the row consistent.

### FR-3 — Barrel exports: DAL
- `src/server/dal/certificates/index.ts` must export the full public surface of:
  - `certificates.dal.ts` (all exports)
  - `signatories.dal.ts` (all exports, including row/result types)
  - `templates.dal.ts` (all exports, including row/result types)
- If any type/DTO/Zod shape is consumed outside the DAL folder from a non-barrel path, document and re-export it through the barrel *or* confirm the current barrel already re-exports it (current barrel exists — confirm completeness).

### FR-4 — Barrel exports: Actions
- `src/server/actions/certificates/index.ts` must export the full public surface of:
  - `certificates.actions.ts` (all named exports including action result types)
  - `signatories.actions.ts` (all named exports including result types)
  - `templates.actions.ts` (all named exports including result types)
- Same completeness check as FR-3; ensure no external file imports deeper than the barrel for these modules.

### FR-5 — RBAC: every mutation gated
- Confirm each Server Action in `certificates.actions.ts`, `signatories.actions.ts`, `templates.actions.ts` calls `requirePermission()` *before* any Zod parse and DAL write.
- Confirm every mutation writes an `audit()` record with actor, action, entity, entityId, and summary/meta.
- Confirm every mutation calls `invalidate(...tags)` with tags covering list + detail + verify (where applicable).

### FR-6 — Cache tags centralized and correct
- If certificate-related tags are scattered, centralize them in `src/server/revalidate.ts` (tags already exist — confirm coverage):
  - `CERTIFICATE_TAGS`, `SIGNATORY_TAGS`, `TEMPLATE_TAGS`
  - `certificateWriteTags({ id, verificationToken })` returns both list tags and id/token-specific tags
- Confirm `certificateWriteTags` is used on create/update/issue/revoke/reissue/delete/regenerate actions, and that it covers the verify-token tag for public-route invalidation.

### FR-7 — PII boundaries and log safety
- Scan every new/modified file in `src/server/certificates/`, `src/server/dal/certificates/`, `src/server/actions/certificates/`, and pages referencing certificates.
- Enforce:
  - No `console.log`/`console.error` with raw recipient names, phone, email, or message bodies — use `sanitizeForLog()` helpers.
  - No Prisma objects serialized directly to the browser on public routes; only `PublicVerifyView` DTO output allowed.
  - Files under `src/server/*` that touch the DB must have `import "server-only"` (confirm none are missing, none are in client paths).
  - No `src/content/*` imports in new public pages/components.

### FR-8 — DTO PII enforcement on public verify
- `getPublicCertificateByToken()` must return only `PublicVerifyView` (no `recipientIdNumber`, no `verificationToken` in the payload body except inside the `verificationUrl` string computed server-side, no `pdfUrl`, no internal metadata).
- Confirm `mapToPublicVerify` strips every sensitive/internal field.

### FR-9 — Integration: PDF non-blocking
- Confirm `issueCertificateAction` and `reissueCertificateAction` call `schedulePdfGeneration(...)` and never `await` the work.
- Confirm PDF errors are logged with `sanitizeForLog(...)` only and never fail the action (action returns `{ ok: true }` regardless of PDF outcome).

### FR-10 — Integration: tag invalidation on lifecycle events
- Issue → invalidates list + id + verify token tag
- Revoke → invalidates list + id + verify token tag
- Reissue → invalidates list + both certificates (parent + new) + both verify token tags
- Regenerate PDF → invalidates id + verify token tag

### FR-11 — Gates
- `npm run lint` exits 0.
- `npm run typecheck` exits 0.
- `npm run build` exits 0.

### FR-12 — Smoke checks
- Existing admin routes for courses, leads, media, and settings remain reachable and compile (no regressions).
- `/admin/certificates`, `/admin/certificates/new`, `/admin/certificates/[id]` all render without build/runtime errors (validate at compile time via gates; confirm via route file existence).
- `/verify/[token]` for an obviously-invalid token or unknown token yields generic `notFound()` / 404 with no PII leak.
- Git diff confirms additive-only: no deletions of non-trivial existing code paths, no existing seed rewrites.

### FR-13 — Completion report
- Create `docs/certificate-implementation-prompts/IMPLEMENTATION_COMPLETE_REPORT.md` containing:
  - Executive summary
  - Files created / modified with additive confirmation
  - Gate results (lint/typecheck/build with exit codes)
  - Smoke test results
  - Privacy & security verification (PII boundaries, RBAC, audit, logs)
  - Known limitations (if any)
  - Rollback readiness (files to revert, data to roll back)

## Non-Functional Requirements

### NFR-1 — Additive-only
- Every change must be strictly additive or tightening of exports without removing existing exports or logic. No existing seed block rewrites.

### NFR-2 — Idempotency
- Seed writes use upsert / find-then-create with deterministic unique keys so repeated runs produce identical row counts.

### NFR-3 — Non-production safe
- Seed additions guard by `NODE_ENV !== 'production'` (plus `SEED_FORCE` explicit opt-out consistent with existing `seed.ts` pattern) so an accidental run against production is refused or a no-op.

### NFR-4 — No PII in seeds or logs
- All seed sample data is generic institutional placeholders. All error paths use sanitized log output.

### NFR-5 — Server-only boundary
- All DAL/server modules touching `db` carry `import "server-only"`; none leak into client bundles.

### NFR-6 — Type safety 100%
- `tsc --noEmit` (typecheck) must pass with zero errors after changes.

## Constraints & Dependencies
- Prisma 7 pinned; no upgrade.
- Next.js 16.x as in package.json; use route-groups as-is.
- Server Actions flow per AGENTS.md: `requirePermission → Zod safeParse → DAL write → audit → invalidate(tags) → ActionResult`.
- Money/dates unchanged (money = integer NPR, dates UTC in DB, display Asia/Kathmandu `en-NP` — verify page displays per existing locale formatting in `VerificationCard`).
- Verification pages remain `dynamic = "force-dynamic"`, `revalidate = 0`.
- Verify metadata remains `noindex, nofollow`.
- Existing verify-not-found path stays generic 404 (no differentiation between malformed and unknown tokens).

## Assumptions
- The barrel `index.ts` files already exist at the target paths; Task 2 only verifies completeness and adds missing re-exports.
- Playwright headless PDF engine is already wired from Prompt 5; Task 4 only confirms scheduling and error paths are non-blocking.
- The database (Postgres via Docker) is reachable during lint/typecheck/build — these do not require a running DB. Running seeds is separate from gates; gates alone satisfy FR-11.
- Barrel exports currently exist but may be missing some named exports (e.g., action result types). Implementation will fill gaps without removing any existing export.

## Open Questions
None at specification time; prompt is unambiguous. Implementer proceeds with the above.

## Acceptance Criteria (AC)

### AC-1 (rule) — Seed: two signatories + one template row seeded idempotently and non-production only
**Pass condition**: Running the seed in non-production creates/updates exactly 2 active `CertificateSignatory` rows (displayOrder 0, 1) and 1 active `CertificateTemplate` row, upserted by unique keys; production run is a no-op (blocked or skipped).
**Evidence source**: Seed file(s) diff + post-seed DB counts documented in report.

### AC-2 (rule) — Barrel exports: complete coverage of DAL and actions surfaces
**Pass condition**: For `src/server/dal/certificates/index.ts` and `src/server/actions/certificates/index.ts`, every named export available from the underlying three files is also re-exported by the barrel. No import statement in the codebase imports these modules deeper than `/index` (or the folder root).
**Evidence source**: File diffs of the two `index.ts` barrels; optional grep confirming no sub-path imports exist for these two modules.

### AC-3 (rule) — All mutations have RBAC + audit + invalidate
**Pass condition**: In every Server Action in `certificates.actions.ts`, `signatories.actions.ts`, `templates.actions.ts` (create/update/save/delete/issue/revoke/reissue/regenerate):
1. `requirePermission(...)` is the first check before any Zod parse / DAL access.
2. `audit({ actor, action, entity, entityId, summary, meta })` is called after DAL write.
3. `invalidate(...tags)` is called after audit.
**Evidence source**: Source code scan recorded in the report.

### AC-4 (rule) — Cache tags cover list, id, and verify-token; centralized
**Pass condition**: `revalidate.ts` exports `CERTIFICATE_TAGS`, `SIGNATORY_TAGS`, `TEMPLATE_TAGS`, and `certificateWriteTags(...)`; each action calls `invalidate` with tags that cover list + id + (where applicable) verify-token.
**Evidence source**: Source scan + report.

### AC-5 (rule) — No PII in logs or client payloads; server-only where required
**Pass condition**:
- Grep for `console.log` / `console.error` in certificate-related server files shows only `sanitizeForLog(...)`-wrapped arguments; no raw recipient/email/phone bodies.
- Every file under `src/server/{db.ts, dal/certificates/*, actions/certificates/*, dto/certificates.ts, certificates/**}` that imports Prisma or `db` has `import "server-only"` at the top.
- No file under a `"use client"` boundary imports from `src/server/*`; no public route returns a raw Prisma object.
**Evidence source**: Grep output captured in the report.

### AC-6 (rule) — Public verify DTO strips internal fields
**Pass condition**: `PublicVerifyView` type and `mapToPublicVerify` implementation exclude `recipientIdNumber`, `verificationToken` (except nested inside `verificationUrl`), `pdfUrl`, `metadata`, `revokeReason`, `reissueReason`, `createdById`, `parentCertificateId`, `templateId`.
**Evidence source**: Source scan of dto + types file.

### AC-7 (rule) — PDF scheduling is non-blocking; errors are swallowed and sanitized
**Pass condition**: `issueCertificateAction` and `reissueCertificateAction` invoke `schedulePdfGeneration(id, token, context)` without `await`; inside `schedulePdfGeneration`, all error paths catch, `console.error` through `sanitizeForLog`, and never throw to the caller.
**Evidence source**: Source scan of `certificates.actions.ts` lines 254–481 and `schedulePdfGeneration` helper.

### AC-8 (rule) — Tag invalidation covers the lifecycle
**Pass condition**: Issue, revoke, reissue, and regenerate actions each call `invalidate` with a spread of `certificateWriteTags({...})` covering both the list tags and the id/verify-token tags. Reissue additionally covers the parent certificate's tags + list tags.
**Evidence source**: Line-level source scan in actions.

### AC-9 (rule) — Gates: lint=0, typecheck=0, build=0
**Pass condition**: `npm run lint && npm run typecheck && npm run build` all exit `0` in the terminal.
**Evidence source**: Terminal output snippets in report + exit code assertions.

### AC-10 (rubric) — Smoke & additive-only confidence
**Scale 0–2 (threshold ≥1.5)**:
- 2: All four smoke assertions pass (existing routes compile, admin cert routes exist, verify→404, git diff additive-only) with explicit evidence for each.
- 1: Three of four smoke assertions pass or one is inferred without explicit evidence.
- 0: Two or more smoke assertions fail / missing evidence.
**Evidence source**: Route file list, verify-route 404 code path inspection, `git diff --stat` (or equivalent) output.

### AC-11 (rule) — Completion report exists and contains required sections
**Pass condition**: `docs/certificate-implementation-prompts/IMPLEMENTATION_COMPLETE_REPORT.md` exists with all required FR-13 sections (summary, files, gates, smoke, privacy/security, limitations, rollback) populated with actual values.
**Evidence source**: File presence and section headings check.
