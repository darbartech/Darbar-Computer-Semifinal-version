# 04 — Roadmap: Static Site → Dynamic Platform

Eight phases (0–7), plus an optional Phase 8. Each phase ends in something **working and deployable**, so you can stop after any phase and still have a better website than before.

**How to use:** do phases in order. Inside a phase, tick the checklist. Do not start the next phase until the **Definition of Done** is met.

| Phase | Goal | Effort* | You can show… |
|-------|------|---------|---------------|
| 0 | Clean up & prepare the codebase | 1–2 days | Same site, cleaner repo, builds green |
| 1 | Foundation: DB, auth, admin shell, media | 4–6 days | Log in to an empty admin panel |
| 2 | **Leads**: forms save to DB, CRM inbox, email alerts | 4–5 days | A real enquiry appearing in admin |
| 3 | **Courses**: admin CRUD + public site reads DB | 6–8 days | Edit a course fee → live site changes |
| 4 | Content modules: blog, events, FAQ, gallery, testimonials, team, settings | 8–10 days | Whole site editable |
| 5 | Dashboard & reports | 2–3 days | Charts + KPIs |
| 6 | Hardening, SEO, tests, deploy, go-live | 4–5 days | Production launch |
| 7 | *(optional)* Batches & seat tracking | 3–4 days | "Next batch" is real data |
| 8 | *(optional)* Student portal, payments | separate project | — |

\* One full-stack developer, full-time. Planning numbers only — re-estimate after Phase 1. Total for Phases 0–6 ≈ **30–40 working days**.

---

## Phase 0 — Clean up & prepare (1–2 days)

**Goal:** a tidy, reproducible baseline before changing anything.

- [ ] Create a git repo (if none) and commit the current state **without** `.next/` and `node_modules/`. Tag it `v0-static`.
- [ ] Fix **P1**: `npm i zod@4 @hookform/resolvers@5` (zod is currently only a hidden transitive dependency, and resolvers 3.10 + zod 4 makes `zodResolver` throw). Then submit each of the 4 forms with invalid data in the browser and confirm inline error messages appear.
- [ ] Delete `lib/app/` (stale duplicate, **P3**) after confirming nothing imports from it: `grep -r "lib/app" src app`.
- [ ] Move `app/` → `src/app/` (**P5**). Next.js will use `src/app` once it exists. Confirm `components.json` → `src/app/globals.css` is now correct.
- [ ] Read `node_modules/next/dist/docs/` sections on: caching, Server Actions, `proxy`, route groups (as `AGENTS.md` instructs).
- [ ] Pin Node (`.nvmrc`, Next 16 needs Node ≥ 20.9) and add `"engines"` to `package.json`.
- [ ] Add scripts: `typecheck` (`tsc --noEmit`), `test`, `db:*` placeholders.
- [ ] Add `.env.example` (see `02` §6) and a short top-level `README.md` (currently only `npm run dev`).
- [ ] Add CI (GitHub Actions): `npm ci && npm run lint && npm run typecheck && npm run build`.
- [ ] Create `docker-compose.yml` with a local PostgreSQL service.

**Definition of Done:** `npm run build` passes on a clean clone; site looks identical to before; CI green.

---

## Phase 1 — Foundation (4–6 days)

**Goal:** database, migrations, auth, admin shell, media upload — with **no public-site changes yet**.

### 1.1 Database & Prisma
- [ ] `docker compose up -d` → local Postgres.
- [ ] Install Prisma **pinned to major 7** + adapter (`prisma@7`, `@prisma/client@7`, `@prisma/adapter-pg@7`, `pg`, `dotenv`, `tsx` — see `03`). Create `prisma.config.ts`, `src/server/db.ts` (singleton client).
- [ ] Paste the schema from `03`, run `prisma migrate dev --name init`.
- [ ] Add `import "server-only"` to every file in `src/server/` so it can never be bundled to the browser.

### 1.2 Layout split (fixes **P4**)
- [ ] `src/app/layout.tsx` → keep only `<html>`, `<body>`, font, global CSS, `ToastProvider`.
- [ ] Create `src/app/(public)/layout.tsx` with Header, Footer, WhatsAppButton and the JSON-LD scripts; move **all existing pages** into `(public)/` (URLs do not change because route groups are not part of the path).
- [ ] Verify every public URL still works and metadata is unchanged.

### 1.3 Auth & roles
- [ ] Install auth library, wire it to Prisma, **disable public sign-up**.
- [ ] `src/server/session.ts`: `getSession()`, `requireUser()`, `requireRole(roles[])`.
- [ ] `src/proxy.ts`: redirect `/admin/*` (except `/admin/login`) when no session cookie.
- [ ] `/admin/login` page (reuse `Input`, `Button`, `Label`, Zod + react-hook-form).
- [ ] `prisma/seed.ts` creates the first `SUPER_ADMIN` from `SEED_ADMIN_EMAIL/PASSWORD`.
- [ ] Login rate limiting + generic error message (don't reveal whether the email exists).

### 1.4 Admin shell
- [ ] `admin/(protected)/layout.tsx`: server-side session check, sidebar (items filtered by role), top bar with user menu + logout.
- [ ] Reusable admin components: `PageHeader`, `DataTable` (TanStack), `FormField` wrappers, `ConfirmDialog`, `StatusBadge`, empty/loader/error states.
- [ ] Mobile-responsive sidebar (use the existing `Sheet` component).

### 1.5 Media
- [ ] Cloudinary account + env vars; `app/api/upload/sign/route.ts` returns signed params (role-checked, size/type limited).
- [ ] `ImagePicker` component (upload, choose from library, alt text required).
- [ ] `admin/media` page: grid, upload, search, delete (only if unused).
- [ ] Add the storage host to `images.remotePatterns` in `next.config.mjs` (**P13**).

### 1.6 Audit log helper
- [ ] `src/server/services/audit.ts`: `audit({ actor, action, entity, entityId, summary, meta })`.

**Definition of Done:** you can log in as the seeded super admin, see an empty dashboard, upload an image, log out; `/admin` redirects when logged out; all public pages unchanged; a non-admin session cannot call an action (test with a second user).

---

## Phase 2 — Leads: start capturing enquiries (4–5 days)

**Goal:** the highest-value fix. Every inquiry/contact submission is stored and staff are notified.

### 2.1 Public forms → database
- [ ] Move Zod schemas out of the form components into `src/lib/validators/{lead,contact,newsletter}.ts` (shared by client and server).
- [ ] Server Actions: `submitInquiry`, `submitContact`, `subscribeNewsletter` in `src/server/actions/public-forms.ts`.
- [ ] Each action: validate with Zod → **honeypot check** → **Turnstile verify** → **rate limit** (by `ipHash`) → insert → send email → return `{ ok, message }` (no stack traces).
- [ ] **Duplicate check:** same phone within 7 days → still store, mark activity "duplicate enquiry" and notify the assignee.
- [ ] Capture UTM params + referrer on the inquiry form (hidden fields from URL/cookie) and a **consent checkbox** + privacy text.
- [ ] Update the 3 form components: replace the `setTimeout` + `console.log` + `mailto:` block with the action call; keep the existing success/error toast UI. Remove the hard-coded email.
- [ ] Course dropdown in `AdmissionInquiryForm` must receive `courses` as a **prop** (parent server component), not import `courses.ts` (**P2**). For now parent can still pass data from `courses.ts`; Phase 3 swaps the source.
- [ ] Decide on `NewsletterSignup` (**P11**): place it in the footer/blog, or delete it.

### 2.2 Admin: Leads
- [ ] `/admin/leads`: table with search (name/phone/email), filters (status, course, source, assignee, date range), sort, pagination, saved "New / Mine / Follow-up today" views.
- [ ] `/admin/leads/[id]`: details, status change, assign to staff, follow-up date, add note/call log, activity timeline.
- [ ] Bulk actions: assign, mark spam. Hard delete only for SUPER_ADMIN.
- [ ] CSV export route (`/api/leads/export`, role-checked, audit-logged).
- [ ] `/admin/messages` (contact inbox) and `/admin/subscribers` (list, export, unsubscribe).

### 2.3 Notifications
- [ ] Email to `LEAD_NOTIFY_TO` on new lead (name, phone, course, link to admin page).
- [ ] Optional auto-reply to the student ("We received your inquiry").
- [ ] Failed email must **not** fail the form submission: save first, send email after, log failures.

**Definition of Done:** submit the real inquiry form on the site → row appears in `Lead`, staff email arrives, lead is visible and editable in admin; spam bot (honeypot filled) is silently dropped; 6 rapid submissions from one IP are throttled.

> 🚀 **Optional early release:** after Phase 2 you can deploy (see `08`) — the public site still uses static content but is now *capturing leads*.

---

## Phase 3 — Courses: first full vertical slice (6–8 days)

**Goal:** edit courses in admin → public site updates. This phase establishes the pattern reused in Phase 4.

### 3.1 Seed
- [ ] Write the course part of `prisma/seed.ts` (see `07`): 6 category groups, 15 categories, 37 courses, media rows for the 37 image URLs. All seeded as `PUBLISHED` (the data is production-quality; only a few `overview` fields are missing).
- [ ] Run seed, verify counts (6 / 15 / 37) and spot-check 3 courses against `courses.ts`.

### 3.2 Data layer
- [ ] `dal/courses.ts`: `listPublishedCourses()`, `getPublishedCourseBySlug()`, `getFeaturedCourses(n)`, `getRelatedCourses(course)`, `listCategoryGroups()`; admin versions: `adminListCourses(filters)`, `adminGetCourse(id)`.
- [ ] `dal/mappers.ts`: `toCourseView(row)` → returns the **existing** `Course` type (so `CourseCard`, `CourseGrid`, JSON-LD helpers work unchanged). Includes `formatDuration(weeks)`, enum→label maps (`"Physical / Online"`).
- [ ] Cached reads with tags `courses`, `course:<slug>`.

### 3.3 Public pages switch to DB (fixes **P2** for courses)
- [ ] `/courses/page.tsx` (server) fetches courses + category groups → passes to `CoursesClient` as props. Remove `import { courses }` from client code. Keep client-side filtering.
- [ ] `/courses/[slug]`, home page featured courses, footer "popular courses", `CategoryDirectory` (if kept), inquiry form dropdown → DAL.
- [ ] `generateStaticParams` and `generateMetadata` read from DAL. Unknown slug → `notFound()`. Draft/archived → `notFound()`.
- [ ] `sitemap.ts`: courses from DB.

### 3.4 Admin: Courses & categories
- [ ] `/admin/courses`: table (title, category, level, fee, status, featured, updated), filters, search, status quick-toggle, duplicate course action.
- [ ] `/admin/courses/new` and `/[id]`: tabbed form — **Basics** · **Details** (level, duration, modes, time slots, fee, certificates, seats) · **Content** (overview, skills, tools, projects, careers, objectives as tag/list inputs) · **Media** (cover picker) · **SEO** (title/description with length counters + Google-style preview) · **Publishing** (status, featured, order).
- [ ] Validation: unique slug (auto from title, editable with warning once published), fee ≥ 0, SEO title ≤ 60 / description ≤ 160 chars.
- [ ] `/admin/categories`: manage categories and their group, sort order, active flag. Block deleting a category that has courses.
- [ ] Every save: Zod → permission check → DB → audit → revalidate tags `courses` and `course:<slug>`.

**Definition of Done:** change a course fee and title in admin → public course page, listing, home page, footer and sitemap reflect it within seconds; archived course disappears and its URL returns 404; `src/content/courses.ts` is no longer imported anywhere except `seed.ts`; Lighthouse performance on `/courses/[slug]` is not worse than before.

---

## Phase 4 — Content modules (8–10 days)

Repeat the Phase 3 pattern (seed → DAL → mapper → public switch → admin CRUD → revalidate) for each module. Suggested order (highest business value first):

| Order | Module | Public pages switched | Special rules |
|-------|--------|----------------------|---------------|
| 4.1 | **Site settings** | Header, Footer, WhatsApp button, contact, about, SEO defaults, JSON-LD | Header & `WhatsAppButton` are **client** components: read settings in `(public)/layout.tsx` and pass as props. Replaces hard-coded email/phone/hours/socials (**P9**). Admin forms per settings group. Stats cannot be saved with placeholder text. |
| 4.2 | **Events** | `/events`, `/events/[slug]`, sitemap (**P8**) | Upcoming = `startsAt > now`; past events auto-move to "Past" tab; cancelled badge. Seed old sample events as **DRAFT**. |
| 4.3 | **Blog** | `/blog`, `/blog/[slug]`, related posts, tags | Markdown editor + preview; `react-markdown` + `rehype-sanitize` replaces `SimpleMarkdown` (**P6**); auto reading time; schedule by `publishedAt`; seed 5 sample posts as **DRAFT** (they say PLACEHOLDER). |
| 4.4 | **FAQ** | `/faq`, home compact FAQ, FAQ JSON-LD | Drag-to-reorder; categories; placeholder answers seeded unpublished until confirmed. |
| 4.5 | **Gallery** | `/gallery` | Multi-upload; one `GalleryCategory` enum (**P12**); bulk delete; reorder. |
| 4.6 | **Testimonials** | Home carousel | Cannot publish without `consentGiven`; carousel hidden when none published. |
| 4.7 | **Team** | `/about` | Photo required to publish. |
| 4.8 | **Users** (SUPER_ADMIN) | — | Invite/create staff, assign role, deactivate (never delete users who own audit rows), force password reset. |
| 4.9 | **Audit log** (SUPER_ADMIN) | — | Read-only list with filters (user, entity, date). |

**Definition of Done:** `src/content/` contains no runtime imports (only used by the seed, then moved to `prisma/seed-data/`); every text/image visible on the public site is editable from admin; deleting `src/content/` does not break the build.

---

## Phase 5 — Dashboard & reports (2–3 days)

Implements the widgets in `05` §5.

- [ ] `dal/dashboard.ts` with aggregate queries (counts by status, per day, per course, per source). Keep queries index-friendly; cache for 1–5 minutes.
- [ ] KPI cards: new leads (today / 7 d / 30 d), conversion rate, unassigned leads, follow-ups due, unread messages.
- [ ] Charts: leads per day (30 d), funnel by status, top courses by enquiries, leads by source/UTM campaign.
- [ ] Lists: latest 10 leads, follow-ups due today, upcoming events, content drafts waiting.
- [ ] Role-aware: counselors see "my leads"; editors see content widgets only.
- [ ] Date-range filter and CSV export for the leads report.

**Definition of Done:** numbers on the dashboard match a manual count from the leads table for the same period.

---

## Phase 6 — Hardening, SEO, tests, deploy (4–5 days)

Full checklists in `08`. Summary:

- [ ] Security review (every action has `requireRole`; headers/CSP; upload limits; sanitised Markdown; secrets).
- [ ] Tests: unit (validators, mappers, permission matrix), e2e (inquiry → admin; edit course → public; role restrictions).
- [ ] SEO regression: all old URLs still 200, metadata & JSON-LD unchanged or better, sitemap correct, `noindex` on `/admin` and `/student/*` (**P8**), canonical URLs.
- [ ] Performance: image sizes (logo, **P14**), cache headers, Lighthouse ≥ previous scores.
- [ ] Real content entered (stats, team, testimonials with consent, events, FAQ policies).
- [ ] Production: managed Postgres or VPS, automated daily backups + a **tested restore**, uptime monitor, error tracking.
- [ ] Remove or `noindex` the student login/register stubs until a portal exists.
- [ ] Staff training session + a one-page "How to use the admin panel" guide.

**Definition of Done:** go-live checklist in `08` §6 fully ticked; rollback plan written.

---

## Phase 7 — Optional: Batches & seat tracking (3–4 days)

- [ ] Enable the `Batch` model; admin screen per course ("add batch: start date, time slot, seats").
- [ ] Course cards/pages show **real** next batch date and seats left (replaces the free-text "Every Week" label).
- [ ] Inquiry form can pre-select a batch; dashboard shows batch fill rate.

## Phase 8 — Optional: Student portal (separate project)

Only after Phases 0–6 are stable and in use. Needs its own spec: students/guardians, enrollment, attendance, fee records, certificates, notices, payments (eSewa/Khalti). The existing `/student/login` and `/student/register` stubs are placeholders only.

---

## Dependency map

```
Phase 0 ─▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4 ─▶ Phase 5 ─▶ Phase 6
                         │           │          ▲
                         │           └──────────┘  (pattern reuse)
                         └──▶ can deploy early after Phase 2
```

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cached public pages don't update after admin edits | Medium | High (editors lose trust) | One tested revalidation helper per module; e2e test "edit → public changes"; time-based fallback |
| Auth bypass via Server Actions | Medium | Critical | `requireRole` inside every action/DAL write; permission-matrix unit tests |
| Next.js 16 / Prisma 7 API differences from tutorials | High | Medium | Read installed docs first (🔎); pin versions; do Phase 1 as a spike |
| Lost/stale SEO after migration | Low | High | Keep URLs identical; compare sitemap before/after; keep metadata helpers |
| Spam floods leads | High | Medium | Honeypot + Turnstile + rate limit + "spam" status |
| Editors upload huge images | High | Low | Server-side size/type limit; Cloudinary transformations |
| Placeholder content goes live | Medium | High | Seed placeholders as DRAFT; stats validator; testimonial consent gate; go-live checklist |
| Data loss | Low | Critical | Daily backups + monthly restore test |
