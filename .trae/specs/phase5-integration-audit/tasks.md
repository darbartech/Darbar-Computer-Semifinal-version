# Phase 5 Final Integration Audit — Implementation Queue (UPDATED)

Every task maps to an AC in spec.md. Tasks = actual concrete fixes discovered via real audit, not theoretical.

## Task 1: Fix 9 Table Row Type Serialization Mismatches (Date/string + boolean/string)
Status: pending
Priority: high
Dependency: none
Maps to AC: AC-01 (FR-01a to FR-01e)

### TR-1.1 (rule): audit-log page serializes createdAt before passing to AuditLogsTable
- Server page row: createdAt raw Date → string `.toISOString()`
- Pass: typecheck passes audit-log/page.tsx lines 49 area
- Evidence: typecheck no error at AuditLogsTable Props.rows assignment

### TR-1.2 (rule): messages page serializes createdAt for MessageRow
- createdAt Date → string before passing to MessagesTable
- Evidence: typecheck passes messages/page.tsx line 50

### TR-1.3 (rule): subscribers page serializes createdAt + unsubscribedAt for SubscriberRow
- Both dates serialized to ISO strings or widened to accept `Date | string` in SubscribersTable component
- Evidence: typecheck passes subscribers/page.tsx line 50

### TR-1.4 (rule): testimonials page serializes TestimonialRow.createdAt
- Either server-side serialization OR TestimonialsManager row type createdAt widened to `Date | string`
- Evidence: typecheck passes testimonials/page.tsx line 62

### TR-1.5 (rule): users page emailVerified field matches UserRow type (string | null)
- Server component transforms boolean (true/false) → string ISO datetime (emailVerifiedAt) or null → or UserRow type corrected to boolean with updated renderer (truthy check). Choose whichever matches actual semantic (emailVerified = boolean in actual Prisma; correct UserRow to boolean and update renderer).
- Evidence: typecheck passes users/page.tsx line 76

### TR-1.6 (rule): Full typecheck passes 0 errors after all serializations
Evidence: `npm run typecheck` exit 0 (for T1 subset; full verified at Task 8)

## Task 2: Fix Blog and Events Server Action Prisma Input Type Narrowing
Status: pending
Priority: high
Dependency: none
Maps to AC: AC-01 (FR-01h FR-01i)

### TR-2.1 (rule): saveBlogPost correct create/update type narrowing
- Separate variable assignments: createValues: BlogPostCreateInput, updateValues: BlogPostUpdateInput
- Pass Prisma-specific create/update DAL functions with the correctly typed variables
- Type narrowing: if (id) branch uses updateInput; else branch uses createInput
- Evidence: tsc passes blog.ts line 54 area, no TS2345 UpdateInput vs CreateInput mismatch

### TR-2.2 (rule): saveEvent same Prisma create/update narrowing
- Same pattern used for saveEvent values type
- Evidence: tsc passes events.ts line 55 area

## Task 3: Fix FAQ + Gallery Form Action Return Type (ActionResult to void)
Status: pending
Priority: high
Dependency: none
Maps to AC: AC-01 (FR-01f FR-01g)

### TR-3.1 (rule): FAQ page action wrappers return void
- Wrap saveFaqCategory/deleteFaqCategory/saveFaq/deleteFaq/saveFaqReorder calls in client-side handlers that:
  1. Call the server action
  2. Show toast/success/error on result.ok / result.error
  3. Return `Promise<void>` (not ActionResult)
- Evidence: typecheck passes faq/page.tsx lines 58,83,118,232,272

### TR-3.2 (rule): Gallery page action wrapper return void
- Same wrapper pattern for saveGalleryItem action at gallery/page.tsx line 207
- Evidence: tsc no error on Form action prop

## Task 4: Create Missing Events Edit Page (events/[id]/page.tsx)
Status: pending
Priority: high
Dependency: Task 2 (types fixed so action imports work clean)
Maps to AC: AC-02

### TR-4.1 (rule): events/[id]/page.tsx exists and pattern matches blog/[id]
- Async server page function with requirePermission("events.write")
- params Promise<{id: string}> → adminGetEvent → notFound() if missing
- listRecentMedia(24) loaded, can(user.role, "events.write") computed
- Contains EventFormClient component that mirrors events/new EventFormClient (reusable pattern from new/page or inlined)
- Links: Back to /admin/events breadcrumbs + View public page link (/events/[slug])
- Save → saveEvent action → toast → router.refresh()
- NO "use client" at top; default export is server; only inner form component is client (extracted or same-file nested client with correct directive scoping)
- Evidence: File exists, tsc passes, route matches AdminSidebar href (already declared)

## Task 5: Fix Permissions Test Drift (3 tests failing)
Status: pending
Priority: high
Dependency: none
Maps to AC: AC-03

### TR-5.1 (rule): EXPECTED table and PERMISSIONS table aligned
- Add subscriber.update → ADMIN + SUPER_ADMIN (and COUNSELOR if actually supported by existing updateSubscriberAction and docs)
- Add users.read → ADMIN + SUPER_ADMIN
- Add users.write → SUPER_ADMIN only
- OR: If PERMISSIONS object is source of truth and correct, update EXPECTED in tests/permissions.test.ts to match.
- All 3 failing subtests in permissions.test.ts must pass:
  a. "grants exactly the expected actions to every role" — array equals
  b. "denies every action not listed for the role" — no drift
  c. "has no unknown action or role key" — keys match bidirectionally
- Evidence: vitest run tests/permissions.test.ts exit 0

## Task 6: Fix ESLint Errors (any types + UsersTable sync setState)
Status: pending
Priority: medium
Dependency: none
Maps to AC: AC-04 (FR-04a FR-04b)

### TR-6.1 (rule): Replace remaining `any` types in admin pages with proper inferred types
- blog/[id]/page.tsx line 86: `post: any` → use inferred return of adminGetBlogPost or Awaited<> type
- blog/[id]/page.tsx line 119 tag: `any` → use Tag type or infer
- blog/new/page.tsx line 77 same issue
- blog/page.tsx line 50 initialRows any[] → use Awaited return or named type; line 310 rows: any[]
- events/new/page.tsx line 94: `event?: any` → proper type
- events/page.tsx line 71, line 362: same any[] → proper typing
- Evidence: lint 0 @typescript-eslint/no-explicit-any ERRORS (warnings are another rule)

### TR-6.2 (rule): UsersTable useEffect sync setState anti-pattern fixed
- Option A: Replace useEffect with useState initializer function that reads props.rows directly
- Option B: Use startTransition wrapper around setRoleDrafts call
- Option C (best): Eliminate the effect entirely; compute draft from row.role inline when needed, or lift up
- Evidence: lint passes the "Calling setState synchronously within an effect" ESLint rule (no error at UsersTable.tsx)

### TR-6.3 (rule): Overall lint passes 0 ERRORS
- `npm run lint` exit 0 with ERROR count = 0. WARNINGS are okay for this task.
- Evidence: Command output.

## Task 7: Fix Server/Client Boundary on Admin Pages (anti-"use client" + async server mix)
Status: pending
Priority: high
Dependency: Task 6 (lint issues)
Maps to AC: AC-05 (FR-05)

### TR-7.1 (rule): blog/page.tsx correct split
- Remove "use client" from file top
- Extract BlogTableClient into separate `src/components/admin/BlogTableClient.tsx` (or keep inline with proper scoping; if inline, mark ONLY that component export via re-import pattern)
- Default export AdminBlogPage remains async server function; calls requirePermission() + adminListBlogPosts() correctly as server
- No `@next/next/no-async-client-component` lint warning for the page default export
- tsc + lint pass

### TR-7.2 (rule): blog/new/page.tsx correct split
- Same pattern: page is server, form is extracted client component to new file or correctly scoped
- Warning: no no-async-client-component for page default

### TR-7.3 (rule): blog/[id]/page.tsx correct split
- Same pattern: extract BlogFormClient to its own file (BlogFormClient.tsx)
- Page is pure server: perm check → data fetch → render client component

### TR-7.4 (rule): events/page.tsx correct split
- Extract EventsTableClient to EventsTableClient.tsx component
- Remove file-top "use client" from page

### TR-7.5 (rule): events/new/page.tsx correct split
- Extract EventFormClient to EventFormClient.tsx (will also be reused by events/[id] created in Task 4)

### TR-7.6 (rule): events/[id]/page.tsx created in Task 4 uses the EventFormClient already extracted
- No "use client" at file top for the page; uses EventFormClient component from new file

## Task 8: Final Build Audit and Verification Run
Status: pending
Priority: high
Dependency: Tasks 1-7 all completed
Maps to AC: AC-06, AC-07

### TR-8.1 (rule): lint passes exit 0 with 0 errors
Evidence: command output captured

### TR-8.2 (rule): typecheck passes exit 0
Evidence: command output

### TR-8.3 (rule): build attempted; result documented
- `npm run build` executed.
- If DB connectivity or env vars prevent build but lint/typecheck pass, this is documented.
- If build succeeds, capture evidence.
- No new errors introduced by code fixes.
Evidence: command output captured

### TR-8.4 (rule): unit tests run and pass or documented env block
- `npm run test` executed
- All tests pass or failures due to DB/env are documented
- permissions.test.ts specifically passes (Task 5 evidence)

### TR-8.5 (rubric, 0-2, threshold=2): Data flow completeness verification
Perform E2E source walkthrough of all 13 domains:
Course, Blog, Event, FAQ, Gallery, Testimonial, Team, Batch, Lead, ContactMessage, Subscriber, Media, Settings.
For each domain, verify full chain exists:
- Admin UI page route exists
- Permission call (requirePermission in action)
- Zod validation in action
- Server Action file exists in actions/
- DAL in dal/
- Prisma model in schema
- Audit call after write
- Cache invalidation after mutation
- Public DAL listPublished/getPublishedSlug fn exists
- Public page/section consumes the DAL
Scale: 2 = ≥ 11 of 13 full chains verified via source walk, 1 = 9-10, 0 = ≤ 8

### TR-8.6 (rule): Static src/content dependency final grep confirms clean
- Final grep of src/ re-confirms 0 production imports
Evidence: grep command captured

### TR-8.7 (rule): Final 12-section summary produced
Final answer contains:
1. Final implementation summary
2. Files created
3. Files modified
4. Database changes
5. Admin modules completed
6. Public frontend modules connected
7. Static content dependencies removed
8. Security fixes
9. Cache/SEO fixes
10. Tests executed and results
11. Known remaining limitations
12. Final production-readiness status
