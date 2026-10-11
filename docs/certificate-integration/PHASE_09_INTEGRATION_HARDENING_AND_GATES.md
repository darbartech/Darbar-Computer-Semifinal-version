# PHASE 09 — Integration Hardening & Gates
**Role:** Integration Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Wire exports, RBAC, cache tags, PII boundaries, error handling. Do not commit.

## 1. Objective
Harden integration: barrel exports, permission wiring, cache tag consistency, PII guardrails, type exports, safe error handling, and cross-module wiring without breaking existing code.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. Phase 03–08 outputs
4. Existing export patterns (`src/server/dal/index.ts` if exists, action barrels)
5. RBAC utility usage
6. Audit/cache helpers

## 3. Hardening Checklist

### 3.1 Exports (Additive)
- Add barrels: `src/server/dal/certificates/index.ts`, `src/server/actions/certificates/index.ts`
- Export types from `src/server/types/certificates.ts`
- Export Zod schemas from `src/lib/validations/certificates.ts`
- Export DTOs from `src/server/dto/certificates.ts`
- Do not modify existing barrels destructively

### 3.2 RBAC Wiring
- Verify all mutation actions call `requirePermission()` with correct resource/action
- Conservative defaults (ADMIN/SUPER_ADMIN for issue/revoke/reissue)
- UI reflects RBAC (hide/disable actions)
- No role trust from client

### 3.3 Cache Tags Consistency
- Centralize tag builders if helpful (e.g. `certTags.list()`, `certTags.detail(id)`, `certTags.verify(token)`)
- Invalidate on every successful mutation
- Verify no stale lists after issue/revoke/reissue

### 3.4 PII Boundaries
- DTOs enforce minimum fields for public verify
- No PII in logs (search for console.log in new files; remove)
- No PII in audit meta beyond safe fields (certificateNumber, status)
- Verification page never renders disallowed fields
- DAL returns raw only inside server; map to DTOs at boundaries

### 3.5 Error Handling
- ActionResult shape consistent with existing
- Generic messages to client; detailed non-PII to server logs
- Safe catch blocks
- Zod errors flattened safely

### 3.6 Types & Imports
- `import "server-only"` in all server modules (DAL, actions, pdf)
- No server-only imports in client
- No circular imports
- Type-only imports where appropriate

### 3.7 PDF Integration
- `issueCertificateAction` triggers PDF generation (non-blocking? or awaited). Choose safe approach: generate after status change; if fails, don't revert issuance (log). Document behavior.
- PDF stored with reference on Certificate (additive field if added in Phase 02)

### 3.8 Admin Navigation (If Applicable)
- If existing admin nav supports dynamic items, add Certificates entry. Else skip (non-breaking).

## 4. Implementation
Review all new files for:
- server-only directives
- PII leaks
- permission checks
- audit calls
- invalidate calls
- return shapes
- imports

Fix issues additively.

## 5. Acceptance Criteria
- Exports consistent
- RBAC enforced on all mutations
- Cache invalidated correctly
- PII boundaries verified
- No client imports of server-only
- All new modules use server-only where required
- List files changed (if any fixes)

## 6. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 7. Output Required
Hardening summary (checks done, issues fixed), files changed, gates status.

## 8. Definition of Done
Gates pass. Proceed to Phase 10.
