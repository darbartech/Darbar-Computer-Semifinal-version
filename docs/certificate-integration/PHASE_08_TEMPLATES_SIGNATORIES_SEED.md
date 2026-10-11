# PHASE 08 — Templates, Signatories & Seed
**Role:** Data/Content Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Seed data non-production. Align with existing seed conventions. Do not commit.

## 1. Objective
Add support for certificate signatories/templates and provide seed data (non-production) aligned with `prisma/seed*.ts` conventions.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. Existing seeds: `prisma/seed.ts`, `prisma/seed-test.ts`, `prisma/seed-data/`
4. Phase 02 schema additions
5. `certificate-docs/01_REQUIRED_INFORMATION_AND_DECISIONS.md`
6. DAL/Actions from Phases 03–04

## 3. Approach
- Do not overwrite existing seed files. Extend additively if safe, or create `prisma/seed-certificates.ts` and document how to run. Prefer additive changes inside existing seed with guards (check if exists).
- Seed only non-production-safe data (sample signatories, placeholder templates). No real PII.
- Make seeds idempotent (create if not exists by unique fields).

## 4. Seed Entities
- CertificateSignatory: sample primary/secondary signatories (names/titles placeholders, active)
- CertificateTemplate: minimal layout template (if model exists)
- Sample Certificate (DRAFT only, optional, clearly non-production)

## 5. Implementation
- Read `prisma/seed.ts` structure
- Add additive seeding block for certificates (guarded: `if (process.env.NODE_ENV !== 'production')` or check counts)
- Keep idempotent
- No modifications to existing seed data semantics

## 6. Types & Utilities
- Add small helpers if needed under `prisma/` or `scripts/` (additive). Avoid changing existing scripts.

## 7. Acceptance Criteria
- Seed additions are additive, idempotent, non-production safe
- No existing seed logic broken
- Align with existing conventions
- List files changed

## 8. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 9. Output Required
Summary, files changed, seed instructions.

## 10. Definition of Done
Gates pass. Proceed to Phase 09.
