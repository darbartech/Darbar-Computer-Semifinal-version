# PHASE 04 — Server Actions & Audit/Cache
**Role:** Backend Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Create Server Actions following main project pattern. Do not commit.

## 1. Objective
Create Server Actions for certificates (create/update/issue/revoke/reissue/delete/regenerate-pdf/preview) with: `requirePermission()` → Zod `safeParse()` → DAL write → `audit()` → `invalidate(tags)` → return `ActionResult`.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. Existing Server Actions: `src/server/actions/courses.actions.ts`, `src/server/actions/leads.actions.ts` (or similar) — read wrapper pattern, ActionResult shape, permission checks
4. RBAC utilities: `src/server/auth/requirePermission.ts` or equivalent
5. Audit helper: `src/server/audit.ts` or `audit()` usage
6. Cache invalidation: `src/server/cache/` or `revalidateTag()`/tag helpers
7. Phase 03 outputs (types/Zod/DAL)

## 3. Directory Structure (Additive)
Create: `src/server/actions/certificates/`
- `index.ts` (barrel)
- `certificates.actions.ts` (core CRUD/issue/revoke/reissue)
- `signatories.actions.ts`
- `templates.actions.ts`

All "use server"; server-only safe.

## 4. Permission Mapping (Conservative)
Map to existing roles (`SUPER_ADMIN`, `ADMIN`, `EDITOR`, `COUNSELOR`):
- Create/update draft: at least `EDITOR` (or per existing pattern)
- Issue certificate: `ADMIN` or `SUPER_ADMIN` (per policy)
- Revoke/Reissue: `SUPER_ADMIN` (recommended; can be `ADMIN` if policy allows)
- Manage signatories/templates: `ADMIN`/`SUPER_ADMIN`
- View admin lists/details: align with existing admin access

Use `requirePermission()` consistently. Never trust client roles.

## 5. Action Pattern (Must Follow Exactly)
For each mutation:
```text
1. requirePermission(resource/action) or role check
2. const parsed = schema.safeParse(formData or input)
3. if (!parsed.success) return { success:false, error: parsed.error.flatten() or message }
4. try {
     const result = await dal.operation(parsed.data, ctx)
     await audit({ actorId, action: 'CERTIFICATE_ISSUE', targetType:'Certificate', targetId: result.id, meta: nonPII })
     await invalidate([tags...])
     return { success:true, data: result }
   } catch(e){ return safe error }
```

Return `ActionResult<T>` shape matching existing actions.

## 6. Actions to Implement
**Certificates:**
- `createCertificateAction(formData or input)` → create draft
- `updateCertificateAction(id, input)` → update draft
- `issueCertificateAction(id, input)` → issue (set token, snapshot signatories, issuedAt)
- `revokeCertificateAction(id, reason)` → revoke (revokedAt, reason)
- `reissueCertificateAction(id, reason)` → reissue (parent linkage, new cert or mark)
- `deleteCertificateAction(id)` → only if allowed by policy and not ISSUED? Usually DRAFT only
- `regenerateCertificatePdfAction(id)`
- `previewCertificateAction(id)` (generate preview data/URL)

**Signatories/Templates:** CRUD with appropriate permissions + audit + invalidate.

## 7. Cache Tags
Define consistent tags:
- `['certificates']`, `['certificates:list']`
- `['certificate', id]`
- `['certificate:verify', token]` (if cached)
- `['certificate:signatories']`, `['certificate:templates']`
- Admin list filters may use list variants

Invalidate on any successful write. Do not leak token in tag values beyond opaque token (it's opaque; acceptable as part of tag key if used).

## 8. Audit
Use existing `audit()` helper. Log:
- actorId (from session)
- action (SCREAMING_SNAKE_CASE: CERTIFICATE_CREATE/ISSUE/REVOKE/REISSUE/UPDATE/REGENERATE_PDF)
- targetType: 'Certificate' | 'CertificateSignatory' | 'CertificateTemplate'
- targetId
- meta: minimal non-PII (e.g. certificateNumber, status change) — never recipient PII, never tokens in detailed logs

## 9. Implementation Rules
- Additive-only. No changes to existing action files.
- "use server" at top of action files.
- Import types/Zod/DAL from Phase 03.
- Reuse ActionResult type if exists.
- Handle errors safely (no stack traces to client).

## 10. Acceptance Criteria
- Actions created per spec
- Pattern matches existing actions
- requirePermission + Zod + DAL + audit + invalidate present on all mutations
- Tags comprehensive
- PII-safe audit/meta
- List files changed

## 11. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 12. Output Required
Summary, files created, action list, gates status.

## 13. Definition of Done
Gates pass. Proceed to Phase 05.
