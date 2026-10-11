# PHASE 05 — Admin UI Pages & Components
**Role:** Frontend Engineer (Admin UI)  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Add admin routes under `/admin/certificates`. Match existing admin UI patterns. Do not commit.

## 1. Objective
Create admin UI for certificate management: list, create new, view/edit/issue. Follow existing admin layout, shadcn/ui, forms, tables, RBAC-aware UI.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. Existing admin pages: `src/app/admin/courses/page.tsx`, `src/app/admin/courses/new/page.tsx`, `src/app/admin/leads/page.tsx`
4. Admin layout: `src/app/admin/layout.tsx`
5. Admin components: `src/app/admin/(components)/` or shared admin UI
6. shadcn/ui components usage
7. Server Actions usage pattern in admin forms
8. Phase 03–04 outputs

## 3. Route Structure (Additive)
Create:
- `src/app/admin/certificates/page.tsx` (list)
- `src/app/admin/certificates/new/page.tsx` (create draft)
- `src/app/admin/certificates/[id]/page.tsx` (detail/edit/issue actions)
- `src/app/admin/certificates/layout.tsx` (optional if needs specific wrapper; avoid duplicating admin layout)
- `src/components/admin/certificates/` (CertificateForm, CertificateListTable, IssueCertificateDialog, RevokeDialog, SignatorySelector, PreviewPanel)

## 4. Design Principles
- Match existing admin look/feel (spacing, typography, buttons, cards, tables).
- Use shadcn/ui components (Button, Card, Table, Form, Input, Textarea, Select, Dialog, Badge, Toast/sonner if used).
- Client components only when needed (forms/interactivity). Server components for pages where possible.
- Read data via DAL in server components; mutations via Server Actions in forms.
- RBAC-aware: hide/disable actions based on role (read role from session via existing helper).
- Preserve existing visuals. Do not restyle admin globally.
- No server-only imports in client components.

## 5. List Page (`/admin/certificates`)
- Server component: fetch paginated certificates via DAL (PII-safe list)
- Columns: Certificate No., Student (safe display), Course, Status, Issue Date, Actions
- Filters: status, course, date range, search (non-PII)
- Actions: View/Edit (draft), Issue (if eligible), Revoke (if allowed), Reissue (if allowed), Regenerate PDF
- Empty state consistent with existing

## 6. New Page (`/admin/certificates/new`)
- Server component wrapper + client form
- Form fields: recipient details (only fields required), course select, completion/issue dates, modules/items, grade if any, signatories selection, notes (internal)
- Client validation via Zod (or react-hook-form + zodResolver) using schemas from Phase 03
- Submit via `createCertificateAction` → redirect to detail on success
- Show validation errors from ActionResult

## 7. Detail Page (`/admin/certificates/[id]`)
- Server component: load certificate (admin detail)
- Tabs/sections: Details, Modules, Signatories, Issuance, History/Audit (non-PII)
- Actions:
  - Save draft (update)
  - Issue (opens dialog: confirm signatories, issue date, validation)
  - Revoke (reason required)
  - Reissue (reason)
  - Regenerate PDF
  - Preview (link to verify view or internal preview)
- Status-based UI (disable actions when not applicable)
- Show immutable snapshot after issue

## 8. Components
- `CertificateForm.tsx`: reusable form (used new+edit). Client component.
- `CertificateListTable.tsx`: server or client? keep simple; match existing table patterns
- `IssueCertificateDialog.tsx`: client, validates, calls action
- `RevokeDialog.tsx`, `ReissueDialog.tsx`
- `SignatorySelector.tsx`: multi/select with order
- `PreviewPanel.tsx`: internal preview (non-public) showing layout fields

## 9. Navigation (Optional but Nice)
If admin sidebar/menu exists, add "Certificates" link under appropriate section. Do **not** modify existing nav structure destructively; add item only if pattern allows. If unsure, skip modifying nav and rely on direct route access — still functional.

## 10. Implementation Rules
- Additive-only. No edits to existing admin pages/layout/components.
- "use client" only where interactivity required.
- Props-based data passing; no server imports in client.
- Use existing UI components; don't duplicate.
- Keep routes under `/admin/certificates/*` exactly (lowercase).
- Preserve URL patterns; no breaking changes.

## 11. Acceptance Criteria
- Routes render without breaking existing admin
- List/new/[id] pages created
- Forms use Zod schemas + Server Actions
- RBAC-aware UI guards (actions hidden/disabled appropriately)
- Matches existing admin visual style
- No client-side imports of DAL/server-only code
- List files changed

## 12. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 13. Output Required
Summary, routes/components created, gates status.

## 14. Definition of Done
Gates pass. Proceed to Phase 06.
