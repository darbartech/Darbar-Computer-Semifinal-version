# PROMPT 2: SERVER ACTIONS + AUDIT + CACHE
# Paste this entire prompt to implement Server Actions for certificates

## CONTEXT
Foundation (Prompt 1) complete. Now add Server Actions following project conventions.

## MISSION
Implement Server Actions with: `requirePermission()` → Zod `safeParse()` → DAL → `audit()` → `invalidate(tags)` → `ActionResult`

## REQUIRED READING FIRST
1. `AGENTS.md`
2. Existing actions: `src/server/actions/courses.actions.ts`, `src/server/actions/leads.actions.ts`
3. RBAC: `src/server/auth/requirePermission.ts` (or equivalent)
4. Audit: `src/server/audit.ts`
5. Cache: `src/server/cache/` or revalidateTag patterns
6. Prompt 1 outputs (types/Zod/DAL)
7. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`

## STRICT CONSTRAINTS
- Additive-only, no modifications to existing actions
- "use server" on action files
- All mutations audited with non-PII meta only
- Cache tags invalidated after successful writes
- Conservative RBAC (ADMIN/SUPER_ADMIN for issue/revoke/reissue)
- No PII in logs/meta
- Do not commit

## TASKS

### TASK 1: Create Actions Directory
Create `src/server/actions/certificates/`

### TASK 2: Certificate Actions
Create `certificates.actions.ts` with:
- `createCertificateAction(input)` - EDITOR+
- `updateCertificateAction(id, input)` - EDITOR+
- `issueCertificateAction(id, input)` - ADMIN+ (snapshot signatories, set issuedAt, ensure token)
- `revokeCertificateAction(id, reason)` - SUPER_ADMIN (recommended)
- `reissueCertificateAction(id, reason)` - SUPER_ADMIN
- `deleteCertificateAction(id)` - only DRAFT, ADMIN+ (policy-based)
- `regenerateCertificatePdfAction(id)` - ADMIN+

Use ActionResult<T> matching existing shape. Call requirePermission, Zod parse, DAL, audit, invalidate.

### TASK 3: Signatories & Templates Actions
Create `signatories.actions.ts`, `templates.actions.ts` with CRUD + permissions + audit + invalidate.

### TASK 4: Barrel
Create `index.ts` exporting actions.

### TASK 5: Cache Tags
Define tags: `['certificates']`, `['certificates:list']`, `['certificate', id]`, `['certificate:verify', token]`, `['certificate:signatories']`, `['certificate:templates']`. Invalidate appropriately on writes.

### TASK 6: Audit Events
SCREAMING_SNAKE_CASE: CERTIFICATE_CREATE, UPDATE, ISSUE, REVOKE, REISSUE, DELETE, REGENERATE_PDF, SIGNATORY_*, TEMPLATE_*. Meta must be non-PII (certificateNumber, status).

## VERIFICATION GATES
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## OUTPUT
Files created, action list, tags/audit summary, gate results

## DONE WHEN
Gates pass.
