# PROMPT 3: ADMIN UI - Certificates Module
# Paste this entire prompt to implement admin UI

## CONTEXT
Actions (Prompt 2) ready. Add admin UI under /admin/certificates matching existing admin patterns.

## MISSION
Create list/new/[id] pages with forms using shadcn/ui, Server Actions, RBAC-aware UI.

## REQUIRED READING FIRST
1. `AGENTS.md`
2. Admin patterns: `src/app/admin/courses/page.tsx`, `src/app/admin/courses/new/page.tsx`, `src/app/admin/leads/page.tsx`
3. Admin layout: `src/app/admin/layout.tsx`
4. Admin components: `src/app/admin/(components)/`
5. shadcn/ui usage in existing admin
6. Prompts 1-2 outputs

## STRICT CONSTRAINTS
- Additive-only. No changes to existing admin pages/layout/components
- Client components only for interactivity (forms/dialogs)
- No server-only imports in client components
- Props-based data passing
- RBAC-aware (hide/disable by role)
- Match existing admin visual style
- Preserve routes: `/admin/certificates/*`
- Do not commit

## TASKS

### TASK 1: Routes
Create:
- `src/app/admin/certificates/page.tsx` (list, server component)
- `src/app/admin/certificates/new/page.tsx` (create)
- `src/app/admin/certificates/[id]/page.tsx` (detail/edit/issue)

Avoid duplicating admin layout.

### TASK 2: Components
Create `src/components/admin/certificates/`:
- `CertificateListTable.tsx` - table with filters, actions
- `CertificateForm.tsx` - reusable form (react-hook-form + zodResolver using Zod from Prompt 1)
- `IssueCertificateDialog.tsx` - confirm issue, call action
- `RevokeDialog.tsx`, `ReissueDialog.tsx`
- `SignatorySelector.tsx` - select/order signatories
- `PreviewPanel.tsx` - internal preview

### TASK 3: List Page
Server component. Fetch paginated PII-safe list via DAL. Columns: Certificate No, Student (safe), Course, Status, Issue Date, Actions. Filters: status, course, search.

### TASK 4: New Page
Client form + server wrapper. Fields: recipient (minimal), course, dates, modules/items, signatories. Submit via createCertificateAction, redirect to [id] on success. Show ActionResult errors.

### TASK 5: Detail Page
Server component loads admin detail. Actions by status: Save draft, Issue, Revoke, Reissue, Regenerate PDF. Status-based guards. Show snapshot after issue.

### TASK 6: RBAC UI
Hide/disable actions based on role from session (use existing helper). Conservative.

## VERIFICATION GATES
- `npm run lint`
- `npm run typecheck`  
- `npm run build`

## OUTPUT
Routes/components created, RBAC notes, gate results

## DONE WHEN
Gates pass. Admin UI functional and consistent.
