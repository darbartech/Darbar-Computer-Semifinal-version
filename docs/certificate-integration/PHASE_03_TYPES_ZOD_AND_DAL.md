# PHASE 03 — Types, Zod, DAL
**Role:** Backend Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Create server-only DAL/types/schemas. No existing files modified. Do not commit.

## 1. Objective
Create strongly typed contracts for certificate domain aligned to main project conventions: server-only DAL, Zod validation schemas, TypeScript types/interfaces, mappers (DB → DTO), PII-safe DTOs for public/admin.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. `prisma/schema.prisma` (with Phase 02 additions)
4. Existing DAL patterns: e.g. `src/server/dal/courses.dal.ts`, `src/server/dal/leads.dal.ts` or similar
5. Existing action/result types: `src/lib/types/` or `src/server/types/`
6. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md` (fields, workflow)
7. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
8. `certificate-docs/Design Document/06_DYNAMIC_STATIC_FIELDS.md`

## 3. Directory Structure (Additive)
Create:
- `src/server/dal/certificates/` (index.ts, certificates.dal.ts, signatories.dal.ts, templates.dal.ts, utils.ts)
- `src/server/types/certificates.ts` (shared types)
- `src/lib/validations/certificates.ts` (Zod schemas for forms/actions)
- `src/server/dto/certificates.ts` (PII-safe DTOs: AdminListItem, AdminDetail, PublicVerifyDTO)

Rules: `import "server-only"` in all DAL files and server-only modules.

## 4. Types (src/server/types/certificates.ts)
Define:
- Enums mapped to Prisma (CertificateStatus)
- Core entities (Certificate, Signatory, Template, Item, IssuedSignatory)
- Input types: CreateCertificateInput, UpdateCertificateInput, IssueCertificateInput, RevokeCertificateInput, ReissueCertificateInput
- Filter/sort/pagination types consistent with existing DAL patterns
- ActionResult-compatible shapes if needed

## 5. Zod Schemas (src/lib/validations/certificates.ts)
Create client/server-safe Zod schemas for:
- Create/update certificate (validate required fields, dates, course selection, modules)
- Issue certificate (confirm prerequisites: has recipient, course, signatories selected)
- Revoke (reason required)
- Reissue (reason, preserve/adjust fields)
- Signatory/template CRUD
- Search/filters

Validation must enforce: dates valid, no injection, trim strings. Do not accept PII fields beyond what's needed.

## 6. DTOs (src/server/dto/certificates.ts)
PII-safe:
- `PublicVerifyDTO`: certificateNumber, studentName/public display name (only if approved), courseName, issueDate (ISO/UTC), status, issuedSignatories (name/title only), verificationUrl, issuedAt, revokedAt, reissuedAt? minimal set only.
- `AdminCertificateDTO`: full admin view but exclude sensitive internal-only fields as per policy
- Mappers: `mapCertificateToPublicVerify`, `mapToAdminList`, `mapToAdminDetail`

Never include phone/email/address/National ID/DOB/internal IDs not required.

## 7. DAL Layer (src/server/dal/certificates/*.dal.ts)
Functions (typical):
- listCertificates(params: Filters): paginated, non-PII list
- getCertificateById(id): admin detail (careful PII)
- getCertificateByToken(opaqueToken): for verification (returns minimal mapped shape)
- createCertificate(input): transactional where appropriate
- updateCertificate(id, input)
- issueCertificate(id, input): sets status ISSUED, issuedAt, generates/assigns token if not present, creates issued signatories snapshot, immutable snapshot fields
- revokeCertificate(id, reason, actorId)
- reissueCertificate(id, reason, actorId): creates new certificate or marks reissued (preserve parent)
- regenerateCertificatePdf(id)
- signatories/templates CRUD

Conventions:
- `server-only`
- Use Prisma client (existing import pattern)
- Return typed results, consistent error handling with repo
- No direct throw leakage of PII
- Index/token-based lookups

## 8. Implementation Rules
- Additive-only. No modifications to existing files.
- Reuse existing utilities (types, helpers) if present.
- Keep functions pure/server-only.
- Avoid importing server actions in DAL; one-way.

## 9. Acceptance Criteria
- All new files created under specified paths
- Types + Zod + DTOs + DAL implemented per specs
- PII boundaries enforced in DTOs
- `import "server-only"` present in DAL files
- No imports of client-only modules
- List files changed

## 10. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 11. Output Required
Summary, files created (paths), key functions, gates status.

## 12. Definition of Done
Gates pass. Proceed to Phase 04.
