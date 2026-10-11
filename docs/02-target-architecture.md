# 02 — Target Architecture

How the finished system is built, and why each choice was made.

> ⚠️ **Version note.** This project is on Next.js 16 and the repo's own `AGENTS.md` says its APIs differ from older versions. Package APIs (Next.js caching, Prisma 7, the auth library) change quickly. **Treat code in these docs as the pattern; confirm exact function names in the official docs / `node_modules/next/dist/docs/` for the versions you install.** Items that need this check are marked 🔎.

---

## 1. System overview

```
                      ┌───────────────────────────────────────────────┐
  Visitors ──────────▶│  Next.js 16 app (one project)                 │
  (public site)       │                                               │
                      │  (public) routes   ── read ──┐                │
  Staff ─────────────▶│  /admin routes  ── read/write┤                │
  (admin panel)       │       │ Server Actions       ▼                │
                      │       │                 Data Access Layer     │
                      │  proxy.ts (redirects)   (src/server/dal)      │
                      │                              │                │
                      └──────────────┬───────────────┼────────────────┘
                                     │               │
                             ┌───────▼──────┐  ┌─────▼──────┐   ┌────────────┐
                             │ PostgreSQL   │  │ Cloudinary │   │ Email API  │
                             │ (Prisma)     │  │ / R2 media │   │ (Resend/   │
                             └──────────────┘  └────────────┘   │  SMTP)     │
                                                                └────────────┘
```

Three rules keep it clean:

1. **Pages never call Prisma directly.** They call functions in `src/server/dal/*` (the *data access layer*).
2. **Every write goes through a Server Action that (a) checks the user's role, (b) validates with Zod, (c) writes to the DB, (d) writes an audit log, (e) revalidates cached pages.**
3. **Client components never import data.** They receive it as props from a server component.

---

## 2. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 16** (existing) | App Router, Server Components, Server Actions |
| Language | TypeScript strict (existing) | |
| UI | Tailwind 4 + shadcn (existing) | Reuse for admin → consistent look, no new design work |
| Database | **PostgreSQL 16+** | Local dev via Docker; production managed or self-hosted |
| ORM | **Prisma 7** (pin `@7`; npm `latest` currently points to an 8.x release candidate) | 🔎 Prisma 7 changes: generator `prisma-client` with an explicit `output`, DB URL lives in `prisma.config.ts` (not in `schema.prisma`), and a driver adapter (`@prisma/adapter-pg` + `pg`) is required |
| Validation | **Zod** (+ `@hookform/resolvers`, already used) | Add `zod` to `package.json` explicitly |
| Auth | **Better Auth** (email + password, DB sessions, roles) | Alternative: Auth.js v5. 🔎 check which is currently recommended for new projects before installing |
| Admin tables | `@tanstack/react-table` | Sorting, filtering, pagination |
| Charts | `recharts` (or shadcn chart components) | Dashboard |
| Rich text | Markdown editor (e.g. MDXEditor, or textarea + live preview) | Output stored as **Markdown** |
| Markdown render | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Replaces the hand-written `SimpleMarkdown` |
| Media | **Cloudinary** (signed uploads) + `Media` table | Alternative: Cloudflare R2 / S3 |
| Email | **Resend** (or Nodemailer + SMTP) | New-lead notification to staff, optional auto-reply to student |
| Spam control | Honeypot field + Cloudflare Turnstile + DB rate limit | Public forms are the main abuse target |
| Testing | Vitest (unit) + Playwright (end-to-end) | |
| CI | GitHub Actions | lint, typecheck, test, build, `prisma migrate deploy` |

### Why one Next.js app and not a separate API (NestJS/Express)?

The earlier build document in the zip mentions a NestJS backend. For a single institute this adds a second codebase, second deployment, and CORS/auth plumbing with little benefit. Server Actions + a data layer give the same separation. If a **mobile app** or **third-party integrations** are needed later, expose the same DAL through `app/api/v1/*` Route Handlers — no rewrite.

### Why Markdown instead of MDX for blog content?

MDX is *executable code*. Content typed into an admin panel must never be executed. Markdown is rendered and sanitised.

---

## 3. Rendering & caching strategy

| Page type | Strategy |
|-----------|----------|
| Public content pages (`/`, `/courses`, `/courses/[slug]`, `/blog…`, `/events…`, `/faq`, `/about`, `/gallery`) | Server-rendered from cached DAL calls. **Cache is tagged** (`courses`, `course:<slug>`, `blog`, `events`, `faq`, `settings`, …). |
| After an admin saves | Server Action calls the revalidation function for the affected tags → the public page updates within seconds. |
| Safety net | A time-based fallback (e.g. 1 hour) so a missed invalidation can't leave stale content forever. |
| Forms (inquiry, contact) | Server Action → insert → email. Never cached. |
| Admin pages | Always dynamic, always behind auth. |
| `sitemap.ts` | Reads published slugs from DB (cached, tagged). |

🔎 Next.js 16 introduced a new caching model (Cache Components: `"use cache"`, `cacheTag`, `cacheLife`, and `revalidateTag` / `updateTag` for invalidation). Read the caching docs in your installed version, decide between that model and `unstable_cache` once, and use it **only inside the DAL** so the rest of the code doesn't care.

`generateStaticParams` on `/courses/[slug]` etc. can stay (pre-renders known slugs at build); allow new slugs created later to render on first request.

---

## 4. Authentication & authorisation

- **Who logs in:** staff only (`/admin/login`). Students/guardians do **not** log in in v1.
- **Sessions:** server-side sessions in the DB (via the auth library), HTTP-only secure cookie.
- **Roles:** `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `COUNSELOR` (permission matrix in `05`).
- **Three layers of protection** (do all three):
  1. `src/proxy.ts` — fast redirect of unauthenticated visitors away from `/admin/*`. (Next.js 16 renamed `middleware.ts` → **`proxy.ts`**, function `proxy`.) This is only a convenience check.
  2. Admin **layout** re-checks the session on the server.
  3. **Every Server Action and every DAL write function** calls `requireRole([...])` itself. Server Actions are reachable as public POST endpoints, so protecting only the page or the proxy is **not** enough.
- First user: created by a one-time **seed script** (`SUPER_ADMIN`), never by public sign-up. Public registration is disabled.

---

## 5. Target folder structure

```
darbar-site/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                  ← imports today's src/content data (see 07)
├─ prisma.config.ts            ← Prisma 7 CLI config (DB URL, seed command)
├─ src/
│  ├─ proxy.ts                 ← redirect /admin/* when no session
│  ├─ app/
│  │  ├─ layout.tsx            ← MINIMAL: <html>, <body>, fonts, global CSS
│  │  ├─ (public)/
│  │  │  ├─ layout.tsx         ← Header, Footer, WhatsAppButton, site JSON-LD
│  │  │  ├─ page.tsx           ← Home
│  │  │  ├─ about/  courses/  courses/[slug]/  blog/  blog/[slug]/
│  │  │  ├─ events/  events/[slug]/  gallery/  faq/  contact/
│  │  │  ├─ admissions/inquire/  how-it-works/
│  │  │  └─ not-found.tsx
│  │  ├─ admin/
│  │  │  ├─ login/page.tsx                 ← public, no sidebar
│  │  │  └─ (protected)/
│  │  │     ├─ layout.tsx                  ← session check + sidebar + topbar
│  │  │     ├─ page.tsx                    ← Dashboard
│  │  │     ├─ leads/ (list, [id])  messages/  subscribers/
│  │  │     ├─ courses/ (list, new, [id])  categories/  batches/
│  │  │     ├─ blog/  events/  faq/  gallery/  testimonials/  team/
│  │  │     ├─ media/  settings/  users/  audit-log/
│  │  ├─ api/
│  │  │  ├─ upload/sign/route.ts           ← signed upload params for Cloudinary
│  │  │  ├─ leads/export/route.ts          ← CSV export (role-checked)
│  │  │  └─ health/route.ts                ← uptime check
│  │  ├─ sitemap.ts  robots.ts  opengraph-image.tsx  twitter-image.tsx  icon.tsx  apple-icon.tsx
│  │  └─ globals.css
│  ├─ server/                  ← "server-only": never imported by client code
│  │  ├─ db.ts                 ← Prisma client singleton (+ adapter)
│  │  ├─ auth.ts  session.ts   ← auth config, getSession(), requireRole()
│  │  ├─ dal/                  ← read/write functions, one file per entity
│  │  │  ├─ courses.ts categories.ts leads.ts contact.ts subscribers.ts
│  │  │  ├─ blog.ts events.ts faq.ts gallery.ts testimonials.ts team.ts
│  │  │  ├─ settings.ts media.ts users.ts audit.ts dashboard.ts
│  │  │  └─ mappers.ts         ← DB row → existing Course/EventItem/BlogPost shapes
│  │  ├─ actions/              ← "use server" files, one per module
│  │  └─ services/             ← email.ts, storage.ts, rate-limit.ts, turnstile.ts, audit.ts
│  ├─ lib/
│  │  ├─ validators/           ← Zod schemas shared by forms + actions
│  │  ├─ constants.ts  seo.ts  utils.ts   (existing)
│  │  └─ format.ts             ← formatFee, formatDuration, label maps for enums
│  ├─ components/
│  │  ├─ ui/ common/ forms/ layout/ sections/   (existing)
│  │  └─ admin/                ← sidebar, topbar, data-table, field components,
│  │                              image-picker, markdown-editor, stat-card, charts
│  ├─ types/                   ← view types the public components already use
│  └─ generated/prisma/        ← generated Prisma client (git-ignored)
├─ docker-compose.yml          ← local Postgres
├─ .env.example
└─ docs/                       ← this documentation
```

Key moves from today's layout: `app/` → `src/app/`, one root layout → root + `(public)` + `admin`, `src/content/*` → `prisma/seed.ts` data then deleted, `lib/app/` deleted.

---

## 6. Environment variables (`.env.example`)

```bash
# Database
DATABASE_URL="postgresql://darbar:darbar@localhost:5432/darbar?schema=public"

# Site
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Auth
AUTH_SECRET="generate-with: openssl rand -base64 32"
AUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="owner@example.com"
SEED_ADMIN_PASSWORD="change-me-on-first-login"

# Media (Cloudinary example)
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

# Email
RESEND_API_KEY=""
LEAD_NOTIFY_TO="admissions@yourdomain"       # who gets new-lead emails
MAIL_FROM="DarbarTech <no-reply@yourdomain>"

# Spam protection
TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
```
Never prefix secrets with `NEXT_PUBLIC_`. `.env*` is already git-ignored in this project.

---

## 7. Cross-cutting design rules

1. **Slugs are permanent.** Changing a published course slug breaks SEO; the admin form warns and (optionally) stores a redirect.
2. **Soft states, not hard deletes** for content: `DRAFT / PUBLISHED / ARCHIVED`. Hard delete only for spam leads / test data, and always audit-logged.
3. **Money** is stored as integer NPR (`feeNPR Int`), never floats.
4. **Dates** are stored in UTC (`timestamptz`) and displayed in `Asia/Kathmandu`.
5. **Everything an editor can change must be reflected on the public page** within seconds (tag revalidation) — otherwise editors lose trust in the panel.
6. **Audit log** for every create / update / delete / status change in admin.
7. **No personal data in logs.** Leads contain phone/email; log IDs, not contents.
