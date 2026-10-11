# 01 — Current Website Analysis

Findings from reading the uploaded project (`Darbar-Computer-Semifinal-version.zip`). Everything below was verified in the source files.

---

## 1. Snapshot

| Item | Value |
|------|-------|
| Framework | Next.js `^16.2.12` (App Router, Turbopack), React `19.2.4`, TypeScript strict |
| Styling / UI | Tailwind CSS 4, shadcn (`base-nova` style on `@base-ui/react`), `lucide-react`, `framer-motion` |
| Forms | `react-hook-form` + `@hookform/resolvers` + **Zod** (see problem P1) |
| Content | **100 % static**: TypeScript files + 5 MDX files read from disk |
| Backend / DB / Auth | **None** |
| Courses | **37 courses** in **15 categories**, grouped into **6** UI filter groups |
| Images | All remote (Pexels / Unsplash / trae.ai / website-files) |
| Brand | `DarbarTech — Group of Technology` (older text still says *Darbar Computer*) |
| `AGENTS.md` | Warns that this Next.js version has breaking changes and tells you to read `node_modules/next/dist/docs/` before coding |

The zip also contains ~100 MB of `.next/` build cache. It is git-ignored and must **not** be shared or committed.

---

## 2. Project structure (as it is today)

```
/                          (project root)
├─ app/                    ← Next.js routes (at ROOT, not under src/)
│  ├─ layout.tsx           ← Header + Footer + WhatsApp button for EVERY route
│  ├─ page.tsx             ← Home
│  ├─ about/  blog/  blog/[slug]/  contact/  courses/  courses/[slug]/
│  ├─ events/  events/[slug]/  faq/  gallery/  how-it-works/
│  ├─ admissions/inquire/  student/login/  student/register/
│  ├─ sitemap.ts  robots.ts  opengraph-image.tsx  twitter-image.tsx  icon.tsx  apple-icon.tsx
├─ lib/app/                ← ⚠ stale duplicate of app/ (see P3)
├─ src/
│  ├─ components/
│  │  ├─ common/   Badge, Breadcrumbs, Container, Reveal, SectionHeading, WhatsAppButton, logo
│  │  ├─ forms/    AdmissionInquiryForm, ContactForm, StudentLoginForm, StudentRegisterForm
│  │  ├─ layout/   Header (client), Footer
│  │  ├─ sections/ Hero, CourseGrid, CourseCard, WhyChooseUs, TestimonialCarousel,
│  │  │            FAQAccordion, HowItWorks, StatsStrip*, CategoryDirectory*, NewsletterSignup*
│  │  └─ ui/       shadcn primitives (button, card, dialog, select, sheet, tabs, toast…)
│  ├─ content/     ← THE DATA (becomes the database)
│  │  ├─ courses.ts      (≈1,140 lines, 37 courses)
│  │  ├─ institute.ts    (about, contact, hours, socials, stats, why-us, team, facilities, gallery)
│  │  ├─ events.ts  faq.ts  gallery.ts  testimonials.ts (empty)  blog-posts.ts (fs reader)
│  │  └─ blog/*.mdx      (5 sample posts)
│  ├─ lib/       constants.ts, seo.ts (JSON-LD, metadata), utils.ts
│  └─ types/     course.ts, event.ts, blog-post.ts, testimonial.ts
├─ public/       logo (1.3 MB PNG), SVG icons, webmanifest
└─ *.md          10+ design / SEO / audit documents
```
`*` = component exists but is **not used on any page**.

---

## 3. Routes and their data sources

| Route | Rendering today | Data source today | Must become dynamic? |
|-------|-----------------|-------------------|----------------------|
| `/` | Server, static | `courses.ts` (featured), `testimonials.ts`, `faq.ts`, `institute.ts` | ✅ |
| `/about` | Server, static | `institute.ts` (story, mission, vision, facilities, team) | ✅ |
| `/courses` | Server shell + **client** list (filters in browser, URL params `q`, `category`, `level`) | `courses.ts` imported **into the client bundle** | ✅ |
| `/courses/[slug]` | SSG via `generateStaticParams` | `courses.ts` | ✅ |
| `/blog`, `/blog/[slug]` | SSG | MDX files read with `fs` + `gray-matter`; custom `SimpleMarkdown` renderer | ✅ |
| `/events`, `/events/[slug]` | SSG | `events.ts` (`upcoming` is a hard-coded boolean) | ✅ |
| `/gallery` | Server shell + client grid | `gallery.ts` (**and** a second gallery list inside `institute.ts`) | ✅ |
| `/faq` | Server | `faq.ts` (3 categories, 10 Q&As, placeholders flagged) | ✅ |
| `/contact` | Server + `ContactForm` | `institute.ts`; form is a stub | ✅ (form → DB) |
| `/admissions/inquire` | Server + `AdmissionInquiryForm` | `courses.ts` for the course dropdown; form is a stub | ✅ (form → DB) |
| `/how-it-works` | Server | Static copy in a component | ❌ keep static |
| `/student/login`, `/student/register` | Stub forms | none | ⏸ defer (no student portal in v1) |
| `/sitemap.xml`, `/robots.txt`, OG/Twitter/icon images | Generated | courses, blog, events | ✅ (sitemap must read DB) |

---

## 4. Content inventory (what must move into PostgreSQL)

| Source file | What it holds | Size / count | Target (see `03`) |
|-------------|---------------|--------------|-------------------|
| `courses.ts` | Courses (title, category, level, duration, fee, skills, tools, projects, careers, SEO fields, image…) | 37 courses; 8 flagged `featured`; fees NPR 3,000 – 75,000; only 8 have a long `overview` | `Course`, `Category`, `CategoryGroup` |
| `constants.ts` | 15 categories + 6 category groups, levels, nav links, "every course includes" list | — | `Category`, `CategoryGroup`; nav stays in code |
| `institute.ts` | Story / mission / vision; phone, WhatsApp, email, address, hours, socials; stats; "why choose us"; team; facilities | 1 object | `SiteSetting` (JSON groups), `TeamMember` |
| `institute.ts` + `gallery.ts` | Gallery images (two inconsistent lists, different category names) | 9 + generated pool | `GalleryItem`, `Media` |
| `events.ts` | Events | 5 sample events | `Event` |
| `faq.ts` | FAQ categories (Admissions, Fees, Courses & Certification) + Q&A, placeholders flagged | 3 categories, 10 questions | `FaqCategory`, `Faq` |
| `testimonials.ts` | **Empty array** | 0 | `Testimonial` |
| `blog/*.mdx` | Blog posts with front-matter (`title, slug, excerpt, date, cover, author, tags, isDraft`) | 5, all marked placeholder | `BlogPost`, `Tag` |
| Forms | 4 forms + newsletter widget | submit nowhere | `Lead`, `ContactMessage`, `Subscriber` |

### Course fields found in the data (needed to normalise the schema)

| Field | Distinct values observed |
|-------|--------------------------|
| `level` | Beginner (9) · Intermediate (17) · Advanced (10) · Beginner to Intermediate (1) |
| `duration` | 3, 4, 6, 8, 10, 12, 14, 16, 24, 48 **weeks** (always "N Weeks") |
| `learningMode` | Physical / Online · Physical / Hybrid · Physical / Online / Hybrid · Online / Hybrid |
| `newBatch` | Every Week (33) · Every Sunday (3) · Weekend only (1) |
| `timing` | combinations of Morning / Day / Evening / Weekend |
| `instituteCertificate` | Certificate · Professional Certificate · Diploma · Advanced Diploma · Career Program |
| `industryCertification` | Microsoft, Google, Cisco, Adobe, Meta, AWS, Autodesk (sometimes two, comma-separated) |
| `internship` | "Optional Internship" · "Internship Available" |
| `seats`, `feeNote` | free text ("Limited seats…", "3-part installment plan available") |
| list fields | `skillsGained`, `softwareTools`, `portfolioProjects`, `careerOpportunities`, `learningObjectives` |

These repeated values are why the schema in `03` uses enums and arrays instead of free text.

---

## 5. Forms — currently losing every enquiry

| Form | Zod schema | What `onSubmit` does today |
|------|-----------|----------------------------|
| Admission inquiry (`CreateLeadSchema`) | name, phone, email, `courseSlug`, `preferredBatch`, message | `setTimeout(900)` → `console.log` → opens a `mailto:` to a **hard-coded** address. Comment in code: *"TODO: POST /api/v1/leads once backend exists"* |
| Contact | name, email, phone?, subject, organization?, message | same pattern, `TODO: POST /api/v1/contact` |
| Student register / login | name, email, phone, password / emailOrPhone, password | `console.log` of the **password payload** only; no auth |
| Newsletter (`NewsletterSignup`) | email | `setTimeout(700)`; **component is not rendered anywhere** |

**Consequence:** the site generates zero stored leads today. The Zod schemas are good and are reused as-is on the server.

---

## 6. Problems found (and where the roadmap fixes them)

| ID | Severity | Problem | Evidence | Fix (phase in `04`) |
|----|----------|---------|----------|---------------------|
| P1 | 🔴 High | **Form validation is likely broken.** `zod` is imported by all four forms but is **not in `package.json`** — it is only installed indirectly (lockfile resolves it to **4.4.3**) — while `@hookform/resolvers` is pinned at **3.10.0**, which was written for Zod 3. We reproduced this combination in isolation: `zodResolver` **throws a `ZodError`** instead of returning field errors, so invalid input would raise an exception rather than show inline messages. | `package.json`, `package-lock.json`; isolated test with zod 4.4.3 + resolvers 3.10.0 | `npm i zod@4 @hookform/resolvers@5` (resolvers 5.9.1 returned proper field errors in the same test) and click-test all 4 forms (Phase 0) |
| P2 | 🔴 High | **Client components import data directly** — `CoursesClient`, `CategoryDirectory`, `TestimonialCarousel`, `GalleryClient`, `Header`, `WhatsAppButton`, `AdmissionInquiryForm`. A database cannot be queried from client code. | `src/components`, `app/*Client.tsx` | Parent server components fetch and pass **props** (Phase 3–4) |
| P3 | 🟠 Medium | `lib/app/` is an **old copy of `app/`** — 7 files differ, and it lacks `student/` and `how-it-works/`. Confusing, included in type-checking. | `diff -rq app lib/app` | Delete (Phase 0) |
| P4 | 🟠 Medium | One **root layout** puts Header/Footer/WhatsApp on *every* route. The admin area needs a different layout. | `app/layout.tsx` | Split into `(public)` and `(admin)` route groups (Phase 1) |
| P5 | 🟠 Medium | `app/` sits at project root while `tsconfig` alias is `@/* → ./src/*` and `components.json` expects `src/app/globals.css`. | `tsconfig.json`, `components.json` | Move `app/` → `src/app/` (Phase 0) |
| P6 | 🟠 Medium | Blog reads `.mdx` files with `fs` at runtime: impossible to edit from an admin panel and unreliable on serverless hosting. A custom `SimpleMarkdown` renders it (the installed `@next/mdx` is not used for posts). | `blog-posts.ts`, `blog/[slug]/page.tsx` | Move to `BlogPost.contentMd` + Markdown renderer (Phase 5) |
| P7 | 🟠 Medium | **Events "upcoming" is a hard-coded boolean**; the sample dates (Aug–Sep 2026) are already past. | `events.ts` | Store `startsAt`, compute upcoming at query time (Phase 5) |
| P8 | 🟠 Medium | `sitemap.ts` lists **every event as `/events`** (not `/events/<slug>`), and lists `/student/*` pages that have no function. | `app/sitemap.ts` | Rebuild from DB, drop student pages (Phase 3/5) |
| P9 | 🟡 Low | Brand and contact data are duplicated/hard-coded: `mailto:info@darbarcomputer.edu.np` inside the forms, `@darbarcomputer` handle, "Darbar Computer" in SEO keywords vs "DarbarTech" elsewhere. | forms, `seo.ts`, `constants.ts` | Single `SiteSetting` source (Phase 5) |
| P10 | 🟡 Low | **Placeholder content** is flagged but live: stats ("10+ years", "15+ students"), team (generic titles, no photos), FAQ policy answers, all blog posts, all events, gallery (stock photos). Testimonials are empty. | `isPlaceholder` flags | Seeded as **DRAFT**; replaced via admin before launch (Phase 2/5/7) |
| P11 | 🟡 Low | Three components exist but are unused: `StatsStrip`, `CategoryDirectory`, `NewsletterSignup`. | grep for imports | Decide: use or delete (Phase 3) |
| P12 | 🟡 Low | Gallery data exists twice with **different category names** (`Classroom/Lab/Certificates` vs `Campus/Labs/Classes/Certifications`). | `institute.ts` vs `gallery.ts` | One `GalleryCategory` enum (Phase 5) |
| P13 | 🟡 Low | `next.config.mjs` `remotePatterns` only allow stock-photo hosts. Uploaded images need your storage host added. | `next.config.mjs` | Phase 1 |
| P14 | 🟡 Low | `final-logo.png` is 1.3 MB. | `public/images/logo` | Optimise / use SVG (Phase 7) |
| P15 | ℹ️ Info | Course list is filtered **in the browser** (all 37 sent to every visitor). Fine at this size; switch to server-side filtering above ≈ 150 courses. | `CoursesClient.tsx` | Keep for now |

---

## 7. What can stay untouched

- All visual components in `src/components/ui`, `common`, and most of `sections` (props-in, JSX-out).
- The design system, Tailwind tokens, `Hero` (decorative, no data), `HowItWorks`, animations.
- `src/lib/seo.ts` JSON-LD helpers (`courseJsonLd`, `faqJsonLd`, …) — they take typed objects, so they keep working if the DB mapper produces the same shape.
- Zod form schemas (move to `src/lib/validators/`, reuse server-side).
- URL structure — **do not change any public URL**, to protect SEO.

## 8. What must change

1. Data source: `src/content/*` → database via a data-access layer.
2. Layouts: split public vs admin.
3. Client components that import data → receive data as props.
4. Forms: replace stubs with Server Actions that insert into the DB.
5. Blog: MDX files → Markdown in DB.
6. Add: auth, admin UI, dashboard, media upload, email notification, audit log.

> **Low-risk strategy used in the roadmap:** add a *mapper* so database rows are converted to the **same TypeScript shapes** the components already use (`Course`, `EventItem`, `BlogPost`, …). Components then need little or no change.
