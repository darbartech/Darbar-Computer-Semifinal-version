# Independent Code Review — Prompt 06: Seed, Hardening & Final Verification

## Review History

| Item | Value |
|---|---|
| Reviewer | Independent automated review (read-only) |
| Date | 2026-10-05 |
| Spec AC count | 11 (AC-1 … AC-11) |
| Tasks reviewed | 8 (Tasks 1–8 in tasks.md) |
| Files inspected | 12 per scope (seed.ts, 2 DAL, 3 actions, 2 barrels, dto.ts, types.ts, eslint.config.mjs, verify/[token]/page.tsx, IMPLEMENTATION_COMPLETE_REPORT.md) + revalidate.ts + signatories.dal.ts + templates.dal.ts for cross-reference |
| Modifications made | **None** — read-only per reviewer contract |
| Outcome | **PASS with minor findings** |

---

## Independent Evidence per AC (pass/fail + links)

### AC-1 — Seed: two signatories + one template row seeded idempotently and non-production only
**Result: ✅ PASS**
- Production guard present: `prisma/seed.ts:613-617` — checks `NODE_ENV === "production" && SEED_FORCE !== "1"` with early return + log; matches existing `seedSuperAdmin` pattern.
- Idempotency pattern: `prisma/seed.ts:619-646` — `findFirst({ name+title` then update/create for signatories; `prisma/seed.ts:648-669` — findFirst name+version for template. Re-run cannot produce duplicates.
- Two active signatories: `prisma/seed.ts:583-600` — displayOrder 0 (Institute Director / Executive Director) + displayOrder 1 (Program Coordinator / Academic Coordinator), both `isActive: true`.
- One template row: `prisma/seed.ts:602-611` — `name="Darbar Standard A4 Landscape"`, `version="1.0"`, layout `{pageSize:A4, orientation:landscape, zones:{}}`, `isActive: true`.
- Non-PII: All values are institutional titles only; no real names, phone email.
- Summary log line present: `prisma/seed.ts:671-677`.
- Called last in `main()`: `prisma/seed.ts:694-710` — `seedCertificates()` called after `seedSuperAdmin()` at line 709.
- Existing seed functions untouched: `seedCatalog`, `printCatalogSummary`, `seedContent`, `seedSettings`, `seedSuperAdmin` all preserved verbatim.

### AC-2 — Barrel exports: complete coverage of DAL and actions surfaces
**Result: ✅ PASS**
- DAL barrel (`src/server/dal/certificates/index.ts:1-5`) — `export *` from all three modules; DAL types: DAL: `SignatoryListRow`, `SignatoryListResult`, `TemplateListRow`, `TemplateListResult`, `GeneratePdfOptions` plus all functions; `export *` in TypeScript 5+ re-exports type-only declarations when declared as `export type` or `export` (types.certificates.dal.ts line 506-512 `GeneratePdfOptions` is `export type` — covered).
- Actions barrel (`src/server/actions/certificates/index.ts:1-3`) — `export *` from all three `.actions.ts` files; includes `CertificateActionResult` (line 38-40 of certificates.actions.ts), `SignatoryActionResult` (line 18-20 signatories), `TemplateActionResult` (line 19-21 templates).
- No sub-path imports: Grep for `"@/server/dal/certificates/` (with forward slash after folder) returned **zero matches** across `src/** — TR 2.2 satisfied; likewise for `@/server/actions/certificates/`. All imports use the barrel.

### AC-3 — All mutations have RBAC + audit + invalidate
**Result: ✅ PASS (11/11 actions triple-checked)**

**Certificate actions (7 actions):
1. `createCertificateAction` — requirePermission:157 → Zod:160 → DAL:164 → audit:169 → invalidate:181 ✓
2. `updateCertificateAction` — requirePermission:199 → Zod:202 → DAL:217 → audit:222 → invalidate:234 ✓
3. `issueCertificateAction` — requirePermission:257 → Zod:260 → DAL:293 → audit:304 → invalidate:317 ✓
4. `revokeCertificateAction` — requirePermission:340 → Zod:343 → DAL:356 → audit:361 → invalidate:373 ✓
5. `reissueCertificateAction` — requirePermission:396 → Zod:399 → DAL:432 → audit:444 → invalidate:458 ✓
6. `deleteCertificateAction` — requirePermission:486 → Zod:489 → DAL:504 → audit:506 → invalidate:517 ✓
7. `regenerateCertificatePdfAction` — requirePermission:535 → Zod:538 → DAL:573 → audit:575 → invalidate:588 ✓

**Signatory actions (2):
8. `saveSignatory` — requirePermission:47 → Zod:50 → DAL:66-68 → audit:70 → invalidate:83 ✓
9. `deleteSignatoryAction` — requirePermission:101 → Zod:104 → DAL:113 → audit:115 → invalidate:126 ✓

**Template actions (2):**
10. `saveTemplate` — requirePermission:48 → Zod:51 → DAL:75-77 → audit:79 → invalidate:91 ✓
11. `deleteTemplateAction` — requirePermission:109 → Zod:112 → DAL:121 → audit:123 → invalidate:134 ✓

### AC-4 — Cache tags cover list, id, and verify-token; centralized
**Result: ✅ PASS**
- Centralized in `src/server/revalidate.ts`:
  - `CERTIFICATE_TAGS = ['certificates', 'certificates:list']` at line 46 ✓
  - `SIGNATORY_TAGS = ['certificate:signatories']` at line 47 ✓
  - `TEMPLATE_TAGS = ['certificate:templates']` at line 48 ✓
  - `certificateWriteTags({ id?, verificationToken? })` at lines 57-62 — returns list tags + `certificate:${id}` + `certificate:verify:${verificationToken}` ✓
- Used in all 7 certificate mutation calls correctly (see AC-3 for line refs); `SIGNATORY_TAGS`/`TEMPLATE_TAGS` correctly spread in save/delete signatory/template (lines 83, 126 signatories; 91, 134 templates).
- Reissue (lines 458-468): spreads both child + parent tags + list tags via `...CERTIFICATE_TAGS`.

### AC-5 — No PII in logs or client payloads; server-only where required
**Result: ✅ PASS (one minor advisory, no leak found)
**Log scan**
- `schedulePdfGeneration` lines 67-82: PDF scheduling log lines use `sanitizeForLog(certId, 16)` and `sanitizeForLog(message, 160)` ✓
- `regenerateCertificatePdfAction` lines 560-565: same pattern ✓
- Seven generic catch blocks (e.g. lines 186-189, 244-247 …): `console.error("[actionName]", error.message` — **minor advisory** not wrapped in sanitizeForLog; no direct PII detected but lacks the sanitization for defensive wrapping. Not a confirmed leak; these are generic catch-alls**. Severity: LOW.
- Seed log lines in seed.ts 615, 675-676 print institutional titles; counts only ✓

**Server-only boundary**
- DB-touching files have `import "server-only"` presence confirmed:
  - DAL files: certificates.dal.ts:1, signatories.dal.ts:1, templates.dal.ts:1, dal/index.ts:1 ✓
  - Action files: certificates.actions.ts:2, signatories.actions.ts:2, templates.actions.ts:2 (after "use server") ✓
  - dto/certificates.ts:1 ✓
  - revalidate.ts:1 ✓
- No `"use client"` files importing `src/server/**`: grep zero matches confirmed; types imports type-only.

**Content imports**
- verify/[token]/page.tsx: imports verified; no `src/content/*` ✓

### AC-6 — Public verify DTO strips internal fields
**Result: ✅ PASS**
**PublicVerifyView type** (`src/server/types/certificates.ts:101-120) includes only: certificateNumber, status, recipientName, courseName, dates (issue/issued/revoked/reissued), issuedSignatories {name,title}, verificationUrl, items {order,title,subtitle}.
**Confirmed excluded (AC-6 strip list):
- `recipientIdNumber` — **NOT in type/DTO ✓
- `verificationToken` (raw) — NOT in type, only inside `verificationUrl` string (dto.ts:73) ✓
- `pdfUrl` — NOT in type ✓
- `metadata` — NOT in type ✓
- `revokeReason`, `reissueReason` — NOT in type ✓
- `createdById` — NOT in type ✓
- `parentCertificateId` — NOT in type ✓
- `templateId` — NOT in type ✓
- `mapToPublicVerify` implementation (`dto/certificates.ts:44-76) exactly matches the type — every field listed 1:1 with type

### AC-7 — PDF scheduling is non-blocking; errors swallowed and sanitized
**Result: ✅ PASS**
- `issueCertificateAction` line 302: `schedulePdfGeneration(..., "issue")` — NO `await` ✓
- `reissueCertificateAction` line 442: `schedulePdfGeneration(..., "reissue")` — NO `await` ✓
- `schedulePdfGeneration` (lines 49-90: returns `void`; inner try/catch:
  - Line 56 try block for PDF generation work; failure does NOT throw up.
  - PDF-error branch lines 67-72: `console.error(... sanitizeForLog(...)).
  - Unexpected-error branch lines 74-82: catch + `console.error(... sanitizeForLog(...)).
  - Lines 83-85: finally cleanup PENDING_PDF_WORK.
  - Callers never throw; issue and reissue return `ok: true`.

### AC-8 — Tag invalidation covers the lifecycle
**Result: ✅ PASS**
Lifecycle actions each have id + verify token.
- **Issue (lines 317-322): `certificateWriteTags({ id: issued.id, verificationToken: data.verificationToken })` covers list + id + verify-token. ✓
- **Revoke (lines 373-378): uses `before.verificationToken`** (not certificateNumber; bug fixed). ✓
- **Reissue (lines 458-468): child tags + parent tags + CERTIFICATE_TAGS list tags list spread. Parent uses `before.verificationToken`. ✓
- **Regenerate PDF (lines 588-593): id + before.verificationToken. ✓
- **updateCertificateAction 234-239 before.verificationToken. ✓
- `getCertificateWriteSnapshot` at `certificates.dal.ts:164-176` selects `verificationToken: true` (line 170). Correct.

### AC-9 — Gates: lint=0, typecheck=0, build=0
**Result: ✅ PASS (self-reported by report; reviewer cannot re-run gates in this review session)**
Report §Verification Gates table reports all exit codes = 0 for lint, typecheck, build with short notes. Trusted for the gates were run by implementer and passed.

### AC-10 — Smoke & additive-only confidence
**Result: ✅ PASS (rubric score 2/2)
- Existing admin routes intact: Report TR 7.1 lists 4 routes present via file existence + build route list.
- Admin certificate routes (list/new/[id]): three `src/app/admin/(protected)/certificates` folders page.tsx files exist per report.
- `/verify/[token]` generic 404 for malformed → `notFound()` lines 68-71; unknown token → `notFound()` lines 73-76. Both call identical `notFound()` — zero probing defeated. ✓
- dynamic = force-dynamic: line 14 verify page. ✓
- noindex metadata: generateMetadata all branches robots index:false, follow:false. ✓
- Additive-only: seed.ts appends lines 583-678 end; only add lines; DAL adds 1 col to select; actions 4 token substitutions; eslint.config.mjs adds 4 glob ignore entries. No deletions of logic. ✓

### AC-11 — Completion report exists and contains required sections
**Result: ✅ PASS**
Report file exists at correct path. All 8 required FR-13 sections populated:
1. Executive Summary — lines 4-13 ✓
2. Files Created / Modified — lines 17-29 ✓
3. Verification Gates — lines 33-42 ✓
4. Smoke Test Results — lines 45-56 ✓
5. Privacy & Security Verification — lines 59-112 (RBAC, audit, invalidate, logs, server-only, DTO) ✓
6. Known Limitations — lines 115-120 ✓
7. Rollback Readiness — lines 124-148 (files revert + SQL DELETE statements provided, ordered by FK ✓
8. Implementation Complete checkboxes — lines 152-165 ✓

---

## Actionable Findings (with file:line)

| # | Severity | Finding | File:line | Fix recommendation |
|---|---|---|---|---|
| F-1 | LOW | 7 catch-block `console.error` calls log bare `error.message` without `sanitizeForLog` defensive wrapping. No confirmed PII leak, but a Prisma or DB-layer error string could theoretically carry a PII fragment embedded in e.g. a unique-constraint violation message including email/name. | `certificates.actions.ts:186-189, 244-247, 327-330, 383-386, 473-476, 522-525, 598-601; signatories.actions.ts:88-91, 131-134; templates.actions.ts:96-99, 139-142 | Wrap the `error.message` string in `sanitizeForLog(message, 200)` |
| F-2 | DOCS | All 8 Task entries in tasks.md have Status field left as `pending`. Per TR requirement: "Status field should be completed per TR pass". Tasks 1–8 require status → `completed`. | `tasks.md:22 (T1), 52 (T2), 85 (T3), 121 (T4), 154 (T5), 180 (T6), 211 (T7), 246 (T8) | Update each Task's **Status**: `pending` → `completed`; fill Completion Evidence. |

No critical / blocked / high-severity findings. No confirmed PII leak, no missing requirePermission/audit/invalidate, no type mismatch, no certificateNumber-as-token bug remaining, no DTO field missing stripping, no missing server-only, no report section missing.

---

## Final Review Result

**Overall: ✅ PASS**

Justification:
- 11/11 ACs pass with concrete line-level evidence (AC-9 trusted per implementer-reported gate run with exit 0).
- 2 low/documentation findings only; none block release.
- Additive-only, no regression, RBAC/audit/invalidate triple in all 11 Server Actions, verify-token bug fixed, DTO strips correctly, barrels complete, sub-path imports zero, server-only present on all DB files, report has all required sections populated + rollback SQL.
- Rubric thresholds met.

## Tasks Status Reconciliation (Tasks 1-8 per tasks.md)

Per tasks.md TR rule: each task's Status field should be completed if all child TRs pass. Reviewer evidence below:

| Task | TRs | Current Status in tasks.md | Evidence | Should be |
|---|---|---|---|---|
| Task 1 Seed | TR 1.1 (idempotent findFirst + upsert/create ✓; TR 1.2 prod guard ✓; TR 1.3 no-PII ✓) | pending | seed.ts:613-678 | **completed** |
| Task 2 Barrels | TR 2.1 all exports re-exported via `export *`; TR 2.2 grep zero sub-path imports ✓ | pending | dal/index.ts, actions/index.ts + greps | **completed** |
| Task 3 RBAC/invalidate | TR 3.1 11/11 triple ✓; TR 3.2 token coverage all actions ✓; TR 3.3 tags centralized revalidate.ts ✓ | pending | all 3 actions files + revalidate.ts | **completed** |
| Task 4 PII/server-only | TR 4.1 only F-1 LOW advisory, no confirmed raw PII; TR 4.2 server-only all present; TR 4.3 DTO strips all 9 fields ✓ | pending | dto.ts + types.ts + server files | **completed** |
| Task 5 Integration PDF/tags | TR 5.1 no-await ✓; TR 5.2 catch+swallow+sanitize ✓; TR 5.3 verificationToken used everywhere (not certificateNumber) ✓ | pending | schedulePdfGen + all lifecycle sites | **completed** |
| Task 6 Gates | TR 6.1 lint 0; TR 6.2 typecheck 0; TR 6.3 build 0 — per implementer report table | pending | report § Gates | **completed** |
| Task 7 Smoke | TR 7.1 dir existence; TR 7.2 both→notFound; TR 7.3 additive 2/2 rubric score ✓ | pending | verify/[token]/page.tsx + report §Smoke | **completed** |
| Task 8 Report | TR 8.1 8 sections all populated; TR 8.2 file list + DELETE SQL both present ✓ | pending | IMPLEMENTATION_COMPLETE_REPORT.md | **completed** |

## Workflow Fidelity Rubric Score

**Score: 2 / 2**
All 8 tasks followed spec ACs, used helper centralized exactly additive throughout; AGENTS.md Server Actions pattern (requirePermission → Zod → DAL → audit → invalidate) honored in all 11 actions. No deviations from specified contract. Minor finding F-2 only doc-only, not a fidelity gap.

## Adaptability Rubric Score

**Score: 2 / 2**
Additive-only changes throughout. Existing code untouched. Bug correctly diagnosed fixed verify-tag used `verificationToken` instead of `certificateNumber` (correct helper: `getCertificateWriteSnapshot` extended `verificationToken`; all 4 call sites corrected. Rollback plan is single-command checkout + targeted DELETE 5 tables minimal blast radius. Clear separation concerns.
