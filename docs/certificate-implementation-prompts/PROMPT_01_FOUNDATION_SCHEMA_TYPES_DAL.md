# PROMPT 1: FOUNDATION - Schema, Types, DAL (Phases 1-3)
# Paste this entire prompt to implement foundation for certificate system

## CONTEXT
You are implementing the DarbarTech Programmable Certificate System into the existing Darbar-Computer-Semifinal-version codebase with ZERO breaking changes.

## MISSION
Complete Prompt 1: Foundation - Add Prisma schema (additive), types, Zod schemas, DTOs, and DAL layer following existing project conventions.

## REQUIRED READING FIRST (MANDATORY)
Read these files in this exact order before writing any code:

1. `AGENTS.md` - Project conventions (DAL+Server Actions, RBAC, audit, cache, server-only, PII rules)
2. `docs/00-README.md` - Project purpose and rules
3. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md` - Master transformation doc
4. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md` - Certificate requirements
5. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md` - Architecture
6. `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md` - Layout zones
7. `certificate-docs/supabase/migrations/001_certificate_system_schema.sql` through `013_mfa_hardening.sql` - Schema reference
8. `prisma/schema.prisma` - Current schema
9. Existing DAL: `src/server/dal/courses.dal.ts`, `src/server/dal/leads.dal.ts` (or similar)

## STRICT CONSTRAINTS
- ADDITIVE ONLY - Do not modify existing models, tables, columns, routes, components, actions
- Never delete or rename existing code
- Follow exact patterns from existing DAL (error handling, return types)
- All server modules MUST have `import "server-only"`
- Never import server code into client components
- No PII in logs
- Public verify URL MUST remain `/verify/[token]` (preserve exactly)
- Dates = UTC in DB; display in Asia/Kathmandu where shown
- Do not commit

## TASKS

### TASK 1: Prisma Schema (Additive)
Edit `prisma/schema.prisma` by APPENDING only. Add:
- Enums: `CertificateStatus` (DRAFT, PENDING_ISSUE, ISSUED, REVOKED, REISSUED, EXPIRED)
- Models (translate from migrations 001-013, avoiding auth duplicates):
  - `CertificateSignatory` (id, name, title, designation, signatureUrl?, isActive, displayOrder, createdAt, updatedAt)
  - `CertificateTemplate` (id, name, version, layoutConfig Json?, isActive, createdAt, updatedAt)
  - `Certificate` (id, certificateNumber unique, verificationToken unique opaque, status, recipientName, recipientIdNumber? (internal only), courseId FK to Course?, courseName snapshot, completionDate DateTime?, issueDate DateTime?, issuedAt DateTime?, revokedAt DateTime?, reissuedAt DateTime?, revokeReason?, reissueReason?, parentCertificateId?, pdfUrl?, metadata Json?, createdById?, createdAt, updatedAt, + relations)
  - `CertificateItem` (modules/subjects, order)
  - `CertificateIssuedSignatory` (snapshot at issuance: signatoryId, name, title, designation, displayOrder)

Add indexes: verificationToken, certificateNumber, status, courseId, issuedAt. Add relations carefully.

### TASK 2: Types
Create `src/server/types/certificates.ts`:
- Types for all models
- Inputs: CreateCertificateInput, UpdateCertificateInput, IssueCertificateInput, RevokeCertificateInput, ReissueCertificateInput
- Filters/pagination
- PublicVerifyView, AdminCertificateView

### TASK 3: Zod Schemas
Create `src/lib/validations/certificates.ts` with schemas for create/update/issue/revoke/reissue/signatories/templates.

### TASK 4: DTOs (PII-Safe)
Create `src/server/dto/certificates.ts`:
- `PublicVerifyDTO` - ONLY: certificateNumber, status, studentName/public display name (approved), courseName, issueDate, issuedAt, revokedAt, reissuedAt, issuedSignatories[{name,title}], verificationUrl
- NEVER include phone/email/address/NID/DOB/internal IDs
- Mappers: mapToPublicVerify, mapToAdminList, mapToAdminDetail

### TASK 5: DAL Layer
Create `src/server/dal/certificates/` with:
- `certificates.dal.ts` - list, getById, getByToken(opaque), create, update, issue, revoke, reissue, regeneratePdf
- `signatories.dal.ts` - CRUD
- `templates.dal.ts` - CRUD
- `index.ts` barrel
- All with `import "server-only"`

Use existing Prisma client import pattern. Follow existing error handling style.

## VERIFICATION GATES (MUST PASS)
1. `npm run lint` - clean
2. `npm run typecheck` - clean  
3. `npm run build` - succeeds

## OUTPUT
- List all files created/modified (only prisma/schema.prisma modified additively)
- Show Prisma additions summary
- Report gate results
- Confirm PII boundaries enforced

## DONE WHEN
All gates pass. Foundation complete. Do not commit.
