# PROMPT 4: PUBLIC VERIFICATION ROUTE
# Paste this entire prompt to implement public verification

## CONTEXT
Admin UI complete. Implement public verification at `/verify/[token]` with strict privacy.

## MISSION
Create public verification route preserving URL EXACTLY `/verify/[token]`. Expose only minimum approved PII.

## REQUIRED READING FIRST
1. `AGENTS.md` (PII rules)
2. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md` (verification)
3. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
4. Prompt 1 DTOs/DAL (PublicVerifyDTO)
5. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`

## STRICT CONSTRAINTS
- Route MUST be `/verify/[token]` exactly - no change
- Minimum PII only in PublicVerifyDTO
- NEVER expose: phone,email,address,NID,DOB,guardian,payment,internal ID,attendance,remarks,assessment,admin notes
- Generic errors (no info leakage)
- No PII in logs
- Additive-only
- Do not commit

## TASKS

### TASK 1: Route Pages
Create:
- `src/app/verify/[token]/page.tsx` (server component)
- `src/app/verify/[token]/loading.tsx`
- `src/app/verify/[token]/not-found.tsx`

Handle params (Promise if Next.js 15) per existing patterns.

### TASK 2: Data Fetch
Server component: get token, call `getCertificateByToken(token)` via DAL, map to PublicVerifyDTO. If not found → not found.

### TASK 3: Component
Create `src/components/verify/VerificationCard.tsx` (prefer server; client only if needed). Show:
- Status badge (ISSUED/VALID, REVOKED, REISSUED)
- Certificate number, student (only approved), course, issue/issued/revoked/reissued dates
- Issued signatories (name,title only)
- Verification URL
- Print button (`window.print()`)
- Printable-friendly styles

### TASK 4: Privacy & Caching
- Generic "Certificate not found or invalid" if invalid
- Consider no-store or safe revalidate (status can change on revoke)
- No console logs of PII/tokens

## VERIFICATION GATES
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## OUTPUT
Files created, PublicVerifyDTO usage confirmed, privacy checklist, gate results

## DONE WHEN
Gates pass. Verify route preserves exact URL and exposes minimal data only.
