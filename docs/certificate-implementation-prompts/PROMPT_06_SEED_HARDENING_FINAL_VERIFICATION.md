# PROMPT 6: SEED, HARDENING & FINAL VERIFICATION
# Paste this entire prompt to seed data, harden integration, and run full verification

## CONTEXT
PDF (Prompt 5) complete. Finalize with seeds, hardening, and end-to-end verification.

## MISSION
Add non-production seeds, harden (exports, RBAC, cache, PII boundaries), then verify all gates + smoke tests.

## REQUIRED READING FIRST
1. `AGENTS.md`
2. Existing seeds: `prisma/seed.ts`, `prisma/seed-test.ts`
3. All Prompt 1-5 outputs
4. `certificate-docs/Design Document/10_QA_CHECKLIST.md`

## STRICT CONSTRAINTS
- Additive-only throughout
- Seeds must be idempotent and non-production safe (guard with NODE_ENV)
- No modifications to existing seed logic
- No PII in seeds
- Do not commit

## TASKS

### TASK 1: Seeds
Read `prisma/seed.ts`. Add additive seeding for CertificateSignatory (sample active primary/secondary), CertificateTemplate (minimal), guarded to non-production. Idempotent (check exists by unique).

Option: create `prisma/seed-certificates.ts` if cleaner, document usage. Prefer additive block in existing seed.

### TASK 2: Hardening - Exports
Add barrels:
- `src/server/dal/certificates/index.ts`
- `src/server/actions/certificates/index.ts`
Export types/Zod/DTOs from their modules cleanly.

### TASK 3: Hardening - RBAC/Cache/PII
- Verify all mutations have requirePermission + audit + invalidate
- Centralize cache tags if helpful
- Scan all new files: no console.log with PII, no server-only imports in client, has server-only where required
- DTOs enforce PII boundaries

### TASK 4: Integration Checks
- Issue action triggers PDF safely (non-blocking if fails, logged non-PII)
- Verify tags invalidate on issue/revoke/reissue
- Public verify uses DTO only

### TASK 5: Final Verification
Run gates:
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Smoke checks:
- Existing admin routes intact (courses/leads/media/settings)
- `/admin/certificates` list/new/[id] render
- `/verify/[token]` invalid → generic 404/no PII
- Additive-only git changes confirmed

### TASK 6: Final Report
Create `docs/certificate-implementation-prompts/IMPLEMENTATION_COMPLETE_REPORT.md` with:
- Summary, files created/modified (additive confirmation)
- Gates results
- Smoke test results
- Privacy/security verification
- Known limitations (if any)
- Rollback readiness

## VERIFICATION GATES (ALL MUST PASS)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## OUTPUT
Report created, all gates pass, go/no-go, concise summary

## DONE WHEN
All gates pass, report created. Implementation complete. Do NOT commit unless explicitly requested.
