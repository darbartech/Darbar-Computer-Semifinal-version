# PHASE 10 — Final Verification & Rollout
**Role:** QA/Integration Lead  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Final end-to-end verification. Non-breaking confirmation. Do not commit.

## 1. Objective
Perform comprehensive verification: gates, smoke tests, design/parity checks, print/PDF sanity, privacy checks, rollback readiness, and produce final integration report.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. All Phase checklists/reports
4. `certificate-docs/Design Document/10_QA_CHECKLIST.md`
5. `certificate-docs/04_IMPLEMENTATION_TASKS_AND_ACCEPTANCE_TESTS.md`

## 3. Pre-Flight
- Confirm all phases 01–09 complete
- Review git status (additive changes only)
- Ensure no modifications to existing core files (unless justified and documented)

## 4. Verification Gates (Must All Pass)
- `npm run lint` — clean
- `npm run typecheck` — clean (no new type errors)
- `npm run build` — succeeds

## 5. Smoke Tests (Manual/Static)
- Existing routes still load conceptually (admin courses/leads/media/settings)
- `/admin/certificates` accessible (list)
- `/admin/certificates/new` renders form
- `/verify/[token]` with invalid token → 404/generic (no PII leakage)
- RBAC: mutation actions require permission (code review)
- Server Actions follow pattern

## 6. Design & Print Parity (Checklist)
From Design Document 10_QA_CHECKLIST.md and specs:
- A4 landscape layout structure matches zone map (positions)
- Text vector-first in PDF
- QR present, points to `/verify/[token]`, high-res
- Logo/branding preserved (no changes)
- Colors/fonts per spec (licensed only)
- 300PPI target respected
- Bleed considerations if enabled
- No full low-res raster of entire certificate

## 7. Privacy & Security Checks
- Public verify exposes only approved fields
- No phone/email/address/NID/DOB in public output
- Opaque token (no PII)
- No PII in logs
- Audit meta non-PII
- requirePermission on all mutations

## 8. Data Integrity
- Prisma schema additive only
- Indexes/uniques present
- Snapshot on issue (issued signatories frozen)
- Reissue/revoke states correct
- Parent linkage for reissue if implemented

## 9. Rollback Readiness
- Changes are additive (new files + new tables/enums)
- No drops/renames of existing schema
- Can revert by removing new directories/files and Prisma additions
- Document rollback steps

## 10. Final Report
Create `docs/certificate-integration/10_FINAL_INTEGRATION_REPORT.md` containing:
- Executive summary
- Phases completed with status
- Files created/modified (additive-only confirmation)
- Gates results
- Smoke test results
- Parity/print checks
- Privacy/security verification
- Known limitations (if any)
- Rollback plan
- Recommendation (ready to proceed or needs fixes)

## 11. Acceptance Criteria
- All gates pass
- Privacy checks pass
- No breaking changes to existing functionality
- `/verify/[token]` preserved exactly
- Report complete and accurate

## 12. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 13. Output Required
Final report path, gates status, go/no-go recommendation, concise summary.

## 14. Definition of Done
All verification complete, gates pass, report created. Integration merge plan execution finished (implementation phases ready; do not commit unless explicitly requested).
