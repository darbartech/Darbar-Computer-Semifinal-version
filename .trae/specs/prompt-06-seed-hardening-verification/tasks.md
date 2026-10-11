# Tasks — Prompt 06: Seed, Hardening & Final Verification

Parent ACs are in spec.md. Each task maps 1..n ACs and has local Test Requirements (TRs) of type `rule` or `rubric`.

## Task 1: Seed — CertificateSignatory and CertificateTemplate rows
**Parent ACs**: AC-1, NFR-1 (additive), NFR-2 (idempotent), NFR-3 (non-production), NFR-4 (no PII)

**Scope**: Edit `prisma/seed.ts` to append one additive `seedCertificates()` block after `seedSuperAdmin()` inside `main()`, guarded by non-production check. Keep all existing `seed*` calls intact.

### Work
1. Read the existing end of `prisma/seed.ts` (lines 597–624). Insert a new `seedCertificates()` function above `main()` that:
   - Builds 2 `CertificateSignatory` upserts using deterministic unique keys (prefer: `name + title` uniqueness via a `findFirst` lookup before `upsert`, or use a deterministic synthetic ID if the schema allows a stable unique field — the schema has no unique constraints on signatory fields, so use `findFirst({ where: { name, title } })` then `upsert` by `id` when found / `create` otherwise with a deterministic comment).
   - Primary signatory: generic institutional Director/Principal placeholder, `isActive=true`, `displayOrder=0`, no signature URL (or null).
   - Secondary signatory: generic institutional Program Coordinator placeholder, `isActive=true`, `displayOrder=1`.
   - One `CertificateTemplate` upsert by the compound unique `(name, version)`: `name = "Darbar Standard A4 Landscape"`, `version = "1.0"`, `isActive=true`, `layoutConfig` = `{ pageSize: "A4", orientation: "landscape", zones: {} }` (minimal JSONB-safe config).
2. Wrap the entire body of `seedCertificates()` in an `if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1')` guard with a return, consistent with the existing seed pattern at lines 599–605.
3. Call `seedCertificates()` as the last step in `main()` (after `seedSuperAdmin()`).
4. Add a summary `console.log` line at the end of `seedCertificates()` reporting `Signatory=N Template=N` counts.
5. If cleaner separation is preferred by the implementer, create `prisma/seed-certificates.ts` with identical idempotent logic and add a one-line re-export/call from `prisma/seed.ts`. Prefer additive block in existing seed.

### Status
- **Status**: pending
- **Blocked By**: —
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 1.1 (rule)**: Running the seed twice yields identical counts (2 signatories, 1 template) with no duplicate rows.
  - Evidence: `CertificateSignatory.count() === 2` and `CertificateTemplate.count() === 1` after two sequential runs, OR source code clearly uses `findFirst + upsert/create` with deterministic keys.
- **TR 1.2 (rule)**: Production guard blocks the seed.
  - Evidence: Source contains `NODE_ENV === 'production' && SEED_FORCE !== '1'` short-circuit inside the new function.
- **TR 1.3 (rule)**: No PII in seed data.
  - Evidence: Manual review of sample names/titles — they are generic (e.g., "Institute Director", "Program Coordinator") with no person-specific values.

---

## Task 2: Hardening — Barrel exports (DAL + Actions)
**Parent ACs**: AC-2

**Scope**: Audit and top up the two barrel files so every named export in the underlying files is re-exported.

### Work
1. **DAL barrel** (`src/server/dal/certificates/index.ts`): Currently re-exports `*` from all three modules.
   - Confirm this also re-exports type-only exports (`SignatoryListRow`, `SignatoryListResult`, `TemplateListRow`, `TemplateListResult`, `GeneratePdfOptions`, `PdfCertificateData`-related types).
   - If any type is missed (due to `import "server-only"` or `isolatedModules`), add explicit `export type { ... }` lines alongside the `export *`.
2. **Actions barrel** (`src/server/actions/certificates/index.ts`): Currently re-exports `*` from all three modules.
   - Confirm action result types (`CertificateActionResult`, `SignatoryActionResult`, `TemplateActionResult`) flow through.
   - If an external consumer imports them sub-path (search codebase), correct those imports to use the barrel.
3. Grep the project for any import statement that imports these modules via a sub-path deeper than the folder (e.g., `from "@/server/dal/certificates/certificates.dal"` rather than `from "@/server/dal/certificates"`). Rewrite to barrel imports when safe.

### Status
- **Status**: pending
- **Blocked By**: —
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 2.1 (rule)**: Both barrel files export every symbol the underlying files export (no missing types in DAL, no missing action result types in actions).
  - Evidence: `tsc --noEmit` with a speculative test import `import * as dal from "@/server/dal/certificates"; import * as act from "@/server/actions/certificates"; typeof dal.* === "function"` for key functions, or explicit read of barrel source showing complete list.
- **TR 2.2 (rule)**: No project file imports via a deeper sub-path than the barrel folder for these two modules.
  - Evidence: `Grep` output showing zero matches on the three specific sub-path patterns.

---

## Task 3: Hardening — RBAC, Audit, Invalidate coverage scan
**Parent ACs**: AC-3, AC-4

**Scope**: Code scan + targeted fixes only. No architectural rewrites.

### Work
1. Line-by-line review each action in the three files:
   - `createCertificateAction`, `updateCertificateAction`, `issueCertificateAction`, `revokeCertificateAction`, `reissueCertificateAction`, `deleteCertificateAction`, `regenerateCertificatePdfAction`
   - `saveSignatory`, `deleteSignatoryAction`
   - `saveTemplate`, `deleteTemplateAction`
   For each confirm:
   - `requirePermission(...)` precedes Zod parse or DAL access.
   - `audit(...)` is called after DAL success.
   - `invalidate(...)` with correct tags called after audit.
   Fix any gap.
2. Verify `certificateWriteTags` is used correctly on create/update/issue/revoke/reissue/delete/regenerate actions.
   - For update/issue/revoke/delete/regenerate: verify `verificationToken` is passed when known (or `certificateNumber` was used previously — if the snapshot helper currently exposes only `certificateNumber`, fix both to use `verificationToken` from now on via a small helper enhancement).
3. Ensure tags are defined once in `revalidate.ts` and not duplicated inline in actions. (Confirm they are already centralized; only fix if not.)

### Status
- **Status**: pending
- **Blocked By**: —
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 3.1 (rule)**: Every Server Action has `requirePermission + audit + invalidate` in correct order.
  - Evidence: Per-action checklist recorded in report + source review.
- **TR 3.2 (rule)**: Tag invalidation covers list + id + verify-token for each lifecycle mutation.
  - Evidence: Line references in actions source.
- **TR 3.3 (rule)**: Tags are centralized in `revalidate.ts` with no ad-hoc string arrays in actions (beyond the helper function call spreads).
  - Evidence: Source scan.

---

## Task 4: Hardening — PII / server-only boundary scan
**Parent ACs**: AC-5, AC-6

**Scope**: Static analysis only + micro-fixes. No functional rewrites.

### Work
1. PII in logs:
   - Grep `src/server/{certificates/**, dal/certificates/**, actions/certificates/**}` for:
     - `console.log(` and `console.error(`
     - Check every argument is passed through `sanitizeForLog(value, maxLen)` or is an already-sanitized identifier (like `cert_id=` followed by a short hash).
     - If any call logs a raw recipient name / email / phone, wrap it in `sanitizeForLog`.
2. Server-only imports:
   - Check each file in `src/server/**` that imports `@/server/db` or the generated Prisma client carries `import "server-only"` at line 1 (or 2 if `"use server"` is first).
   - If any is missing, add it.
   - Grep for `"use client"` files importing server modules — must be zero.
3. Public verify DTO (`mapToPublicVerify` + `PublicVerifyView`):
   - Confirm the return object does not include internal fields listed in AC-6.
   - If a field is present that should not be, remove it from the DTO output and the type.
4. Confirm no file in `src/app/verify` or `src/components/verify` imports anything from `src/content/`.

### Status
- **Status**: pending
- **Blocked By**: —
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 4.1 (rule)**: No raw PII in console.* calls in certificate-related files (every argument is an already-sanitized identifier or is wrapped in sanitizeForLog).
  - Evidence: Grep output with line numbers reviewed.
- **TR 4.2 (rule)**: Every DB/Prisma-touching server file has `import "server-only"`; no client file imports `src/server/**`.
  - Evidence: Line-by-line grep output.
- **TR 4.3 (rule)**: `PublicVerifyView` excludes all fields listed in AC-6.
  - Evidence: Source diff of dto + types file.

---

## Task 5: Integration checks — PDF scheduling + cache invalidation
**Parent ACs**: AC-7, AC-8

**Scope**: Review existing code; if gaps found, apply minimal fix.

### Work
1. Read `schedulePdfGeneration` in `certificates.actions.ts` (lines 49–90). Confirm:
   - Not awaited by callers (issue + reissue).
   - Both try/catch branches do not throw; all errors `console.error` via `sanitizeForLog`; function returns void.
2. Confirm `issueCertificateAction` and `reissueCertificateAction` call `schedulePdfGeneration` and return `{ ok: true }` synchronously after audit + invalidate.
3. Confirm cache invalidation in each of the four lifecycle actions (issue, revoke, reissue, regenerate):
   - Issue: list + id + verify-token → already present (line 319–324).
   - Revoke: list + id + verify-token (lines 375–380) — check that a token is passed; if currently using `certificateNumber` change to actual `verificationToken` via a snapshot helper enhancement.
   - Reissue: both parent + new child IDs, both tokens, + list tags (lines 460–470) — confirm parent's token is included.
   - Regenerate PDF (lines 590–595) — same token check as revoke.
4. If `getCertificateWriteSnapshot` does not yet select `verificationToken`, add it (it currently selects id, certificateNumber, status, recipientName, courseName — extend with `verificationToken`). Then fix each action to pass `verificationToken` to `certificateWriteTags` instead of `certificateNumber` where the latter was incorrectly used.

### Status
- **Status**: pending
- **Blocked By**: Task 3 (shared helper enhancement)
- **Unblock Condition**: Task 3 item 2 complete.
- **Completion Evidence**: —

### Test Requirements
- **TR 5.1 (rule)**: `schedulePdfGeneration` is never `await`ed in callers.
  - Evidence: Source inspection of call sites.
- **TR 5.2 (rule)**: PDF generation never fails the action (catch + swallow with sanitized log).
  - Evidence: Source inspection of try/catch blocks.
- **TR 5.3 (rule)**: Invalidation of the verify token happens via `verificationToken` (not `certificateNumber`) on issue/revoke/reissue/regenerate.
  - Evidence: Code review of the helper + call sites.

---

## Task 6: Gates — lint, typecheck, build
**Parent ACs**: AC-9, NFR-6

**Scope**: Run the three gates sequentially after Tasks 1–5 complete. Fix only the specific issues that block them.

### Work
1. Run `npm run lint` and capture output. Fix new ESLint errors introduced by Tasks 1–5. Do not fix pre-existing unrelated lint errors.
2. Run `npm run typecheck` and capture output. Fix type errors introduced by Tasks 1–5.
3. Run `npm run build` and capture output. Fix build errors. If build hangs or fails due to environmental issues (DB connection required by Prisma generate or existing cache only), resolve via `npm run db:generate` first, document workaround in report.

### Status
- **Status**: pending
- **Blocked By**: Tasks 1–5 complete.
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 6.1 (rule)**: `npm run lint` exits 0.
  - Evidence: Terminal output.
- **TR 6.2 (rule)**: `npm run typecheck` exits 0.
  - Evidence: Terminal output.
- **TR 6.3 (rule)**: `npm run build` exits 0.
  - Evidence: Terminal output.

---

## Task 7: Smoke checks
**Parent ACs**: AC-10

**Scope**: Static + route-level checks. No browser automation required (unless environment supports; use file existence + code paths).

### Work
1. **Existing admin routes intact**: Confirm `src/app/admin/(protected)/` contains:
   - `courses/`, `leads/`, `media/`, `settings/` folders with `page.tsx` — list the files present. If any is missing, note in report as pre-existing gap.
2. **Admin certificate routes render at compile time**: Confirm the three route files exist under `src/app/admin/(protected)/certificates/` with `page.tsx`.
3. **Verify route generic 404**: In `src/app/verify/[token]/page.tsx` confirm both:
   - Zod-safe-parse failure → `notFound()` (lines 68–71)
   - `getPublicCertificateByToken` returns null → `notFound()` (lines 73–76)
   Both paths are identical (no distinguishing error detail), so probing is defeated.
4. **Additive-only diff**: Run `git diff --stat` (or, if no repo, a manual file list) and confirm no non-trivial deletions of existing logic; only additions in seed.ts / barrel files / helpers / report.

### Status
- **Status**: pending
- **Blocked By**: Task 6 complete (ensures routes compile).
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 7.1 (rule)**: File existence checks pass (admin cert + other folders present).
  - Evidence: Directory listing.
- **TR 7.2 (rule)**: Invalid/unknown verify tokens both yield the same generic 404 path (both code paths call `notFound()`).
  - Evidence: Source review.
- **TR 7.3 (rubric) — additive-only confidence 0-2, threshold ≥1.5**:
  - 2: `git diff --stat` shows only net additions across touched files; every deletion is whitespace/comment only.
  - 1: One non-trivial existing line deletion with clear justification of bug/harmless fix.
  - 0: Multiple existing function/logic removals.
  - Evidence: Diff output.

---

## Task 8: Final completion report
**Parent ACs**: AC-11, FR-13

**Scope**: Write `docs/certificate-implementation-prompts/IMPLEMENTATION_COMPLETE_REPORT.md`.

### Work
Populate these sections with actual data after Tasks 1–7:
1. **Executive Summary** — 3–5 lines of what was accomplished.
2. **Files Created / Modified** — per-file list, mark each as additive.
3. **Verification Gates** — actual exit codes for lint / typecheck / build, 1-line output summary each.
4. **Smoke Test Results** — per-item pass/fail with short note.
5. **Privacy & Security Verification** — RBAC check, audit coverage, invalidate coverage, log-sanitization check, server-only boundary, PII DTO boundary.
6. **Known Limitations** — list any limitation discovered (e.g., Playwright not installed → PDF not verified at runtime, DB not running → seed not actually run). Mark none explicitly if none.
7. **Rollback Readiness** — which files to `git checkout` / revert; which DB rows to delete to undo seeds (`DELETE FROM "CertificateIssuedSignatory"; DELETE FROM "CertificateItem"; DELETE FROM "Certificate"; DELETE FROM "CertificateSignatory"; DELETE FROM "CertificateTemplate";`).
8. **Implementation Complete** checkboxes at the end.

### Status
- **Status**: pending
- **Blocked By**: Tasks 1–7 complete.
- **Unblock Condition**: —
- **Completion Evidence**: —

### Test Requirements
- **TR 8.1 (rule)**: Report file exists with all eight sections populated.
  - Evidence: File contents.
- **TR 8.2 (rule)**: Rollback section contains specific file list + SQL statements (even if unused).
  - Evidence: Report section content.
