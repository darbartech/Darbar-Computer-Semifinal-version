# PHASE 02 — Prisma Schema & Migrations Alignment
**Role:** Database Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only to `prisma/schema.prisma`. No existing models/tables/columns modified/deleted. Do not commit.

## 1. Objective
Translate certificate system schema (Supabase migrations 001–013) to Prisma 7 models/enums and add them to `prisma/schema.prisma` in an additive, non-breaking way, aligned with existing conventions (naming, timestamps, relations).

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. `prisma/schema.prisma` (current full schema)
4. `certificate-docs/supabase/migrations/001_certificate_system_schema.sql`
5. `002_course_enhanced_fields.sql`
6. `003_signatory_default_secondary.sql`
7. `004_production_hardening.sql`
8. `005_production_hardening_phase2.sql`
9. `006_reissue_operations.sql`
10. `007_drop_raw_verification_token.sql`
11. `008_certificate_recovery_fields.sql`
12. `009_audit_heads_and_outbox.sql`
13. `010_admin_users_sessions.sql`
14. `011_certificate_constraints.sql`
15. `012_verification_and_constraints.sql`
16. `013_mfa_hardening.sql`
17. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
18. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md`

## 3. Design Principles
- **Additive-only.** Append new `enum` and `model` blocks. Never alter existing fields/models.
- Follow existing Prisma style in this repo (naming, `@map`, `@@map` if any, index style).
- Use UUIDs or strings consistently with existing schema. Prefer consistent ID strategy.
- Dates: UTC. Use `DateTime @db.Timestamptz()` if applicable in existing models; match repo convention.
- Soft deletes if present in migrations? Mirror safely (e.g. `deletedAt DateTime?`, `revokedAt DateTime?`, `reissuedAt DateTime?`).
- Include constraints reflected by unique/indexes, `@unique`, `@@unique`, `@index`, `@@index`.
- Snapshotting: certificate issued signatories (preserve names/titles at issue time) — model as junction with snapshot fields if needed.
- Opaque verification tokens; unique token.
- Privacy: do not store unnecessary PII. Store only fields needed.

## 4. Entities to Add (Minimum, Additive)
Suggested (translate from migrations):
- `enum CertificateStatus` (e.g. DRAFT, PENDING_ISSUE, ISSUED, REVOKED, REISSUED, EXPIRED)
- `enum CertificateDeliveryMethod`, `CertificateFormat` if useful
- `model CertificateSignatory` (active/inactive, order, titles, signatures)
- `model CertificateTemplate` (layout/version, optional)
- `model Course` extensions? **DO NOT MODIFY** existing Course. Only add certificate-related models/relations referencing Course by ID if needed (or add optional fields? AVOID modifying existing). Prefer separate models.
- `model Certificate` (core, status, numbers, dates UTC, recipient non-PII fields per privacy, verificationToken unique, issuedAt, revokedAt, reissuedAt, reissueReason, parentCertificateId for reissue, snapshot fields)
- `model CertificateItem` (modules/subjects per certificate, order, snapshot)
- `model CertificateIssuedSignatory` (snapshot of signatory at issuance: name/title/signatoryId, order, signedAt)
- `model CertificateRevision/Audit` or align with existing `AuditLog`? Prefer use existing `AuditLog` via audit() helper; only add if migrations require dedicated table not covered.
- `model VerificationToken` or embed on Certificate (unique opaque). Avoid exposing raw if not needed.
- If admin auth tables from 010/013 overlap with existing auth: **DO NOT ADD DUPLICATES**. Skip adding admin_users/admin_sessions/MFA models unless explicitly missing and necessary. Document decision in checklist.

## 5. Implementation Rules
- Append only. Preserve spacing/style of existing `schema.prisma`.
- Add clear section: `// ===== CERTIFICATE SYSTEM (ADDITIVE - NON-BREAKING) =====`
- Use `@map`/`@@map` only to match naming if helpful; keep consistent with repo.
- Indexes: add for verificationToken, certificateNumber, status, courseId, issuedAt, token lookups.
- Foreign keys: proper relations; onDelete/onUpdate sensible (restrict/cascade per data integrity).
- Unique constraints: `certificateNumber` (if required), `verificationToken` unique.

## 6. Actions
1. Read current `prisma/schema.prisma` fully
2. Design additive models mapping 001–013 (respect privacy + non-breaking)
3. Append blocks
4. Validate syntax mentally; avoid modifying existing content
5. Note: Do NOT run `prisma migrate dev` in this phase unless instructed. Schema change only.

## 7. Acceptance Criteria
- `prisma/schema.prisma` extended additively only; no existing lines removed/changed
- All new enums/models compile logically (Prisma 7 compatible)
- Indexes/uniques match migration intent without breaking existing
- No duplication of existing auth/audit models (documented if skipped)
- Section header clearly marked ADDITIVE/NON-BREAKING
- List files changed

## 8. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 9. Output Required
Concise summary, diff summary (what added only), files changed, gates status.

## 10. Definition of Done
Schema additive only, gates pass. Proceed to Phase 03.
