# PHASE 06 — Public Verification Route
**Role:** Frontend Engineer (Public Routes)  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Public route **must** be `/verify/[token]` exactly. Strict PII guardrails. Do not commit.

## 1. Objective
Implement public certificate verification route preserving exact URL `/verify/[token]`. Display minimal, approved information only. Support valid/revoked/reissued states and printable view.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md` (verification requirements)
4. `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
5. `certificate-docs/Design Document/06_DYNAMIC_STATIC_FIELDS.md`
6. Phase 03 DTOs (PublicVerifyDTO)
7. Phase 03 DAL (getCertificateByToken)

## 3. Route Structure (Additive)
Create:
- `src/app/verify/[token]/page.tsx` (server component)
- `src/app/verify/[token]/loading.tsx` (optional, simple)
- `src/app/verify/[token]/not-found.tsx` (optional)
- `src/components/verify/VerificationCard.tsx` (presentational, client or server; prefer server where possible)

URL is `/verify/[token]` — preserve exactly (no route change).

## 4. Data Fetching
- Server component: extract `token` from params (Next.js App Router). Params may be Promise in newer versions — handle per project Next.js version; read existing param handling patterns.
- Call DAL `getCertificateByToken(token)` server-side.
- Map to `PublicVerifyDTO` (PII-safe). Never pass raw entity to client.
- If not found/invalid token → return 404 or "Certificate not found/invalid" (generic, no info leakage).

## 5. PublicVerifyDTO (Minimal Fields Only)
Include only:
- certificateNumber
- status (VALID/ISSUED/REVOKED/REISSUED or mapped)
- student/display name (ONLY if explicitly approved in specs; follow privacy rule)
- courseName
- issueDate (ISO/UTC)
- issuedAt, revokedAt, reissuedAt (as applicable)
- issuedSignatories: array of { name, title } (no IDs, no signatures files if sensitive)
- verificationUrl: full public URL
- message/state text

**Explicitly exclude:** phone, email, address, National ID, DOB, guardian, payment, internal student ID, attendance, remarks, assessment, admin notes.

## 6. UI Requirements
- Clean, minimal public page. Do not inherit heavy admin chrome.
- States: Valid (ISSUED), Revoked, Reissued, Not Found/Invalid
- Show verification status clearly (badge)
- Show minimal details in readable layout
- "Print" button (window.print()) for printable view
- Show verification URL/token reference? use opaque token only; don't display raw token unnecessarily
- No admin actions
- Responsive, accessible

## 7. Security & Privacy
- Opaque token only (no sequential IDs in URL)
- Generic error messages
- No PII in logs: never console.log recipient details/token values
- Cache safely: verification pages can be cached if static, but status can change (revoke). Use appropriate caching (e.g. no-store or short revalidate). Follow existing public page caching patterns.
- Avoid indexing sensitive pages? public verify is fine; no PII exposed.

## 8. Implementation Rules
- Additive-only
- Server component by default for page
- Presentational components client only if needed (none required for basic)
- Import from Phase 03 DTOs/DAL
- Preserve exact route path `/verify/[token]`

## 9. Acceptance Criteria
- Route accessible at `/verify/[token]`
- Returns minimal PII-safe data
- States handled correctly
- 404 for invalid token (generic)
- No PII in rendered output beyond approved fields
- Print view works
- No breaking changes to existing routes

## 10. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 11. Output Required
Summary, files created, sample DTO shape, gates status.

## 12. Definition of Done
Gates pass. Proceed to Phase 07.
