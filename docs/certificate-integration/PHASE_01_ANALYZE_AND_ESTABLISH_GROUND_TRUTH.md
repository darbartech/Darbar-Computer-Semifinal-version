# PHASE 01 — Analyze & Establish Ground Truth
**Role:** Senior Software Engineer (Integration Lead)  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. No breaking changes. Do not commit.

## 1. Objective
Read all required references, inventory the codebase vs certificate system, establish a non-breaking baseline, and produce an actionable integration checklist.

## 2. Must-Read References (First)
Read in order before making any changes:
1. `AGENTS.md` (project conventions)
2. `docs/00-README.md`
3. `docs/02-CONTENT-SOURCE-OF-TRUTH.md`
4. `docs/03-ADMIN-MODULES.md`
5. `docs/04-SERVER-ACTION-AND-DAL-CONTRACT.md`
6. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
7. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md`
8. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
9. `certificate-docs/01_REQUIRED_INFORMATION_AND_DECISIONS.md`
10. `certificate-docs/02_PSD_TEMPLATE_MAPPING_AND_PRINT_SPEC.md`
11. `certificate-docs/Design Document/00_EXECUTIVE_SUMMARY_AND_GAP_ANALYSIS.md`
12. `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`
13. `certificate-docs/Design Document/01_DOCUMENT_AND_PRINT_SPEC.md`
14. `certificate-docs/Design Document/07_FONT_LICENSING_AND_ASSETS.md`
15. `certificate-docs/supabase/migrations/001_certificate_system_schema.sql` through `013_mfa_hardening.sql` (skim all)

## 3. Baseline Verification (Non-Breaking)
- Record current git status: `git status --short`
- Get branch: `git rev-parse --abbrev-ref HEAD`
- Verify existing structure: `prisma/schema.prisma`, `src/server/dal/`, `src/server/actions/`, `src/app/admin/`, `src/app/`, `src/middleware.ts`
- Run baseline gates: `npm run lint && npm run typecheck && npm run build`. Capture results (must pass). If any fail, STOP and report.

## 4. Inventory & Mapping
Produce a concise analysis covering:
- Existing RBAC roles and how they're enforced (`requirePermission` usage patterns)
- DAL + Server Actions patterns (return types, error shapes, audit/cache usage)
- Admin layout/navigation patterns, shadcn/ui usage, form/table patterns
- Auth/session model
- Existing cache tag conventions (invalidation patterns)
- Public route patterns
- PDF/asset handling (Cloudinary), fonts, images

## 5. Create Integration Checklist
Create `docs/certificate-integration/01_INTEGRATION_CHECKLIST.md` with:
- Phase status (pending/in_progress/completed), owner, gates, acceptance per phase
- Risk register + mitigation
- Files-to-create/modify (additive-only)
- Open questions (if any) — answer by reading specs first; only ask user if critical decision not specified

## 6. Constraints (Hard)
- Additive-only. Do NOT modify existing tables/models/columns/routes/components unless absolutely necessary and justified (document reason). Prefer new files.
- Preserve `/verify/[token]` exactly as public URL.
- No PII in logs/public verification.
- Follow AGENTS.md conventions strictly.
- Do not commit.

## 7. Acceptance Criteria
- All required references read
- Baseline gates pass
- `docs/certificate-integration/01_INTEGRATION_CHECKLIST.md` created with full phase checklist
- Summary written: findings, assumptions, no-breaking confirmation
- List of files changed (should be 1 file max at this phase)

## 8. Verification Gates (Must Pass Before Done)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 9. Output Required
Return concise summary (< 10 lines), list files changed, gates status, and any non-blocking notes.

## 10. Definition of Done
Phase 01 complete when all above satisfied. Do not proceed to Phase 02 until gates pass.
