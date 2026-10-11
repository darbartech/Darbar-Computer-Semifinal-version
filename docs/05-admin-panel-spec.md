# 05 — Admin Panel & Dashboard Specification

What to build at `/admin`: navigation, roles, every module's screens and fields, and the dashboard.

---

## 1. Principles

1. **Reuse the existing design system** (`src/components/ui`, Tailwind tokens) so the admin looks like part of the brand and needs no new design work.
2. **Desktop-first, mobile-usable.** Counselors will check leads from a phone → tables collapse to cards below `md`; sidebar becomes a `Sheet`.
3. **Every list has:** search, filters, sort, pagination (server-side), empty state, loading skeleton.
4. **Every form has:** inline Zod validation, unsaved-changes warning, clear success/error toast, disabled button while saving.
5. **Destructive actions** use a confirm dialog; content is archived rather than deleted.
6. **Show the public effect:** after saving content, show "View on site ↗" (opens the public URL).

---

## 2. Roles & permissions

| Module | SUPER_ADMIN | ADMIN | EDITOR | COUNSELOR |
|--------|:-----------:|:-----:|:------:|:---------:|
| Dashboard | full | full | content widgets | lead widgets (own) |
| Leads | full (+delete, export) | full (+export) | — | view/edit **assigned or unassigned**; no export |
| Contact messages | full | full | — | view / reply status |
| Subscribers | full (+export) | full (+export) | — | — |
| Courses & categories | full | full | create/edit (cannot archive/delete) | read-only |
| Blog, Events, FAQ, Gallery, Testimonials, Team | full | full | create/edit/publish | read-only |
| Media library | full | full | upload / use | — |
| Site settings | full | edit (except domain/SEO defaults) | — | — |
| Users | full | — | — | — |
| Audit log | full | read | — | — |
| Account (own password, profile) | ✔ | ✔ | ✔ | ✔ |

Implementation: one `permissions.ts` map `{ [action]: Role[] }` (e.g. `"course.archive": ["SUPER_ADMIN","ADMIN"]`), used by (a) sidebar filtering, (b) `requireRole`/`can()` inside every Server Action, (c) unit tests that assert the matrix. **UI hiding is cosmetic — the server check is the real one.**

---

## 3. Navigation (sidebar)

```
Dashboard
── Admissions ──────
  Leads            (badge: new count)
  Contact messages (badge: unread)
  Subscribers
── Catalog ─────────
  Courses
  Categories
  Batches          (Phase 7)
── Website ─────────
  Blog
  Events
  FAQ
  Gallery
  Testimonials
  Team
  Media library
  Site settings
── System ──────────
  Users            (SUPER_ADMIN)
  Audit log
```
Top bar: global search (leads + courses), "View site ↗", user menu (profile, change password, logout).

---

## 4. Module specifications

### 4.1 Leads (admissions CRM)

**List** `/admin/leads`
- Columns: created, name, phone (click-to-call), course, preferred batch, source/campaign, status, assignee, follow-up date.
- Filters: status, course, source, utm campaign, assignee, date range, "has follow-up due".
- Quick views (tabs): **New** · **My leads** · **Follow-up today** · **All** · **Spam**.
- Row actions: change status, assign, WhatsApp link (`https://wa.me/<number>`), call link.
- Bulk: assign, mark spam. Export CSV (ADMIN+).

**Detail** `/admin/leads/[id]`
- Left: contact info, course (link), message, source/UTM, consent timestamp.
- Right: status stepper (`NEW → CONTACTED → COUNSELING_DONE → DEMO_SCHEDULED → ENROLLED` or `LOST` with required reason), assignee dropdown, follow-up date picker.
- Timeline: notes, calls, status changes, assignments (from `LeadActivity`), newest first; "Add note" box.
- Duplicate banner if the same phone appears in other leads.

**Rules**
- Moving to `LOST` requires a reason. Moving to `ENROLLED` records the date (used for conversion metrics).
- Counselors cannot see leads assigned to others (enforced in the DAL query, not only in the UI).

### 4.2 Contact messages
List with status (`NEW/READ/REPLIED/ARCHIVED/SPAM`), detail view, "Reply by email" (mailto) and "Mark replied". Unread count badge in sidebar.

### 4.3 Subscribers
Email, status, source, date. Export CSV. Unsubscribe action. (Sending campaigns is out of scope — export to an email tool.)

### 4.4 Courses

Form tabs and fields (all map to `Course` in `03`):

| Tab | Fields |
|-----|--------|
| Basics | Title, slug (auto, editable), category, tagline, short description |
| Details | Level, duration (weeks), learning modes (multi-select), time slots (multi-select), batch frequency text, target students, prerequisites, institute certificate, industry certifications (tags), internship, seats note, **fee (NPR)**, fee note |
| Content | Overview (textarea), skills gained / software & tools / portfolio projects / career opportunities / learning objectives (each a re-orderable tag-list input) |
| Media | Cover image (picker, alt text) |
| SEO | SEO title (≤ 60, counter), meta description (≤ 160, counter), live search-result preview, CTA button text |
| Publishing | Status (Draft/Published/Archived), featured toggle + order (max 8 featured recommended), sort order |

List: title, category, level, duration, fee, status, featured ★, updated. Row actions: edit, duplicate, preview, archive. Bulk: publish, archive, set category.

### 4.5 Categories
Name, slug, group (the 6 UI groups), description, sort order, active. Cannot delete if courses exist (offer "move courses to…").

### 4.6 Blog
Title, slug, excerpt, cover, tags (create-as-you-type), author display name, **Markdown editor with live preview**, SEO fields, status, publish date (future date = scheduled). Auto reading time on save. Preview as draft at a signed/authenticated URL.

### 4.7 Events
Title, slug, category, start date-time, end date-time, location, short + full description, cover, registration URL (optional), capacity (optional), status (Draft/Published/Cancelled). List tabs: **Upcoming / Past / Draft**.

### 4.8 FAQ
Category CRUD; question + answer (Markdown-lite) with drag-to-reorder; published toggle.

### 4.9 Gallery
Multi-file upload, per-image title/alt (alt **required**), category, taken date, reorder, publish toggle, bulk delete.

### 4.10 Testimonials
Name, course, quote, rating (1–5), photo, **"consent obtained" checkbox + note** — Publish is disabled until consent is ticked.

### 4.11 Team
Name, role, specialty, bio, photo, order, published toggle.

### 4.12 Media library
Grid + search, upload (drag & drop, max size/type enforced), edit alt text, "used in" list, delete only when unused.

### 4.13 Site settings
One tab per group (see `03` §4): **General · Contact & hours · Social links · About (story/mission/vision) · Stats · Why choose us · Facilities · SEO defaults**. Each tab validates with Zod and revalidates the `settings` tag.

### 4.14 Users (SUPER_ADMIN)
Create user (name, email, role, temporary password or invite link), change role, deactivate/reactivate, reset password. A SUPER_ADMIN cannot demote/deactivate themselves; there must always be ≥ 1 active SUPER_ADMIN.

### 4.15 Audit log
Read-only table: time, user, action, entity, summary; filters by user/entity/date; click row → JSON diff of `meta`.

---

## 5. Dashboard (`/admin`)

### KPI cards (top row)
| Card | Definition |
|------|------------|
| New leads | count by `createdAt` for today / last 7 days / last 30 days (+ % change vs previous period) |
| Conversion rate | `ENROLLED ÷ all non-spam leads` for the selected range |
| Unassigned leads | `status NEW` and `assignedToId IS NULL` |
| Follow-ups due | `followUpAt ≤ end of today` and status not `ENROLLED/LOST/SPAM` |
| Unread messages | `ContactMessage.status = NEW` |
| Subscribers | active count (+ new this month) |

### Charts
1. **Leads per day** — line/area, last 30 days (range selectable).
2. **Pipeline funnel** — counts per `LeadStatus`.
3. **Top 10 courses by enquiries** — horizontal bars.
4. **Leads by source / UTM campaign** — bars or donut (shows which social campaigns work).
5. **Enquiries by preferred batch time** — helps plan timings.

### Lists
- Latest 10 leads (click → detail).
- Follow-ups due today (with call/WhatsApp buttons).
- Upcoming events (next 3).
- Content needing attention: drafts older than 14 days, FAQ/testimonials awaiting publish, courses without cover image or SEO text.

### Role variants
- **COUNSELOR:** KPI limited to "my leads", my follow-ups, my conversion.
- **EDITOR:** content health lists only; no lead data.

### Technical notes
- All aggregates in `src/server/dal/dashboard.ts`; use `groupBy`/`count` with the indexes from `03`; for per-day series use one raw SQL `date_trunc('day', created_at AT TIME ZONE 'Asia/Kathmandu')` query.
- Cache each widget 1–5 minutes; invalidate `dashboard` tag when a lead changes status.
- Charts are client components receiving plain JSON props (`recharts`); the numbers are computed on the server.

---

## 6. UX checklist for each admin screen

- [ ] Page title + breadcrumbs
- [ ] Loading, empty, and error states
- [ ] Server-side pagination (default 20/page) and URL-synced filters (shareable links)
- [ ] Keyboard-accessible forms, visible focus, labelled inputs
- [ ] Toast on success/failure; validation errors next to fields
- [ ] Confirm dialog for destructive/irreversible actions
- [ ] Audit entry written; public cache revalidated
- [ ] Works at 375 px width

---

## 7. Page → component inventory (admin-specific components to build)

`AdminSidebar`, `AdminTopbar`, `PageHeader`, `StatCard`, `DataTable` (+ `DataTablePagination`, `DataTableFilters`), `StatusBadge`, `ConfirmDialog`, `ImagePicker`, `MediaGrid`, `TagListInput`, `ReorderList` (drag & drop), `MarkdownEditor`, `SeoPreview`, `DateTimePicker`, `RoleGate` (hide UI by role), `ActivityTimeline`, `LeadStatusStepper`, chart wrappers (`LineCard`, `BarCard`, `FunnelCard`).
