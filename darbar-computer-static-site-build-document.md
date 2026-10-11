# DARBAR COMPUTER — Public Website Build Document
## Phase 0: Standalone Static/SSG Next.js Marketing Site (Pre-Backend Preview Build)

> **Status:** Draft v1.0 · **Owner:** Frontend Lead · **Audience:** Whoever builds this site (you, a developer, or Claude Code)
> **Derived from:** `darbar-computer-frontend-specification.md` §0–§4.1, §3, §8, §9; `darbar-computer-platform-spec-part1-foundations.md` §11.2, §11.4; `darbar-computer-documentation-master-plan.md` §2.4 (Part 3 scope)

---

## 0. Purpose & Framing

The full platform (Part 1–2, delivered) defines a three-experience Next.js app: **Public Site**, **Student/Guardian Portal**, and **Staff/Admin Console**, all sitting on a NestJS/PostgreSQL backend. That backend, the CRM/Admissions pipeline, and the Website CMS (Part 3) are **not built yet**.

This document scopes a **standalone build of only the `(public)` route group** — a fully static/SSG Next.js site with **no live backend, no auth, no database**. Its job:

1. Prove out the design system, branding, and information architecture visually before backend work starts.
2. Give the institute leadership something real to click through, approve, and give feedback on.
3. Be built so that swapping local content files for live API calls later (once Part 3's CMS + admissions API exist) requires **zero restructuring** — only replacing the data-fetching layer.

**Explicitly out of scope for this build:** login, student/guardian portal, staff console, real form submission (inquiry/contact forms will validate client-side and log to console / open a `mailto:`, not hit a real endpoint), payments, real blog/CMS backend, multi-branch switching (branch theming is stubbed for one branch only).

---

## 1. Content Gap — Read This First

The source documents define the platform's **modules and screens** but do not contain the institute's actual **marketing content** (real course names, prices, instructor bios, testimonials, photos, brand colors, logo). This build document proceeds with **clearly labeled placeholder content** — a realistic, professional computer-institute course catalog and copy — so the site can be built and reviewed immediately. Every placeholder is flagged `[PLACEHOLDER]` in the content plan (§6) so it's trivial to find-and-replace once real content arrives.

**Before visual sign-off, get from the client:** logo files (SVG preferred), brand color(s) if any exist already, real course list with fees/duration, real address/phone/hours, and 10–15 real photos (classroom, lab, students, certificates).

---

## 2. Tech Stack (scoped down from the full frontend spec)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Only the `(public)` route group — no `(auth)`, `(portal)`, `(console)`, no middleware |
| Language | TypeScript (strict mode) | Same as full spec — keeps this codebase forward-compatible |
| Styling | **Tailwind CSS** | Per frontend spec §1 |
| Components | **Shadcn UI (Radix primitives)** | Install only what's needed: Button, Input, Textarea, Select, Dialog, Accordion, Tabs, Card, Sheet (mobile nav), Toast |
| Icons | **lucide-react** | Per frontend spec §3.4 |
| Forms | **React Hook Form + Zod** | Client-side only for now (Admission Inquiry, Contact) — schema shape matches the future `CreateLeadDto` so backend wiring later is a drop-in |
| Content source | **Local structured content** — MDX for blog posts, JSON/TS modules for courses/events/testimonials | Shaped to mirror the future API response shape (see §5) — this is the key decision that makes migration painless |
| Images | `next/image`, local `/public/images/` for now | Swap to R2 URLs later; `sizes` attribute mandatory per perf spec |
| Fonts | `next/font` — **Inter** (Latin) + **Noto Sans Devanagari** (if Nepali is in scope for this phase — see §9) | Per frontend spec §3.1 |
| Animation | Framer Motion (optional, subtle only) | Use sparingly — premium feel comes from spacing/typography discipline, not motion |
| Deployment (test) | **Vercel preview deployment** (or Netlify) | Free tier is enough for an internal review site; custom domain optional at this stage |
| Testing | Playwright (smoke test: every route 200s, nav links resolve) + axe-core | Lightweight — full test strategy (frontend spec §12) applies once backend lands |

**Explicitly not used yet:** TanStack Query, Zustand, next-intl's dynamic runtime switching (see §9), api-client.ts, route-permissions.ts — these belong to the authenticated experiences and return when Portal/Console are built.

---

## 3. Project Setup — Step by Step

```bash
# 1. Scaffold
npx create-next-app@latest darbar-computer-site \
  --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
cd darbar-computer-site

# 2. Shadcn UI
npx shadcn@latest init
npx shadcn@latest add button input textarea select dialog accordion tabs card sheet toast badge separator skeleton

# 3. Supporting libraries
npm install react-hook-form zod @hookform/resolvers lucide-react framer-motion
npm install @next/mdx @mdx-js/loader @mdx-js/react gray-matter reading-time
npm install -D @playwright/test @axe-core/playwright

# 4. Fonts (via next/font — no npm install needed, configure in layout)
```

Set up `.env.local` (even though unused this phase, define the shape now):
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_INSTITUTE_NAME="Darbar Computer"
NEXT_PUBLIC_CONTACT_PHONE="[PLACEHOLDER]"
NEXT_PUBLIC_CONTACT_EMAIL="[PLACEHOLDER]"
NEXT_PUBLIC_ADDRESS="[PLACEHOLDER]"
```

---

## 4. Folder Structure

```
src/
  app/
    layout.tsx                 # root layout: fonts, <Header>, <Footer>, metadata defaults
    page.tsx                   # Home
    globals.css                # design tokens as CSS variables
    courses/
      page.tsx                 # Course Catalog (grid + filter)
      [slug]/
        page.tsx                # Course Detail (SSG via generateStaticParams)
    admissions/
      inquire/
        page.tsx                # Admission Inquiry form (client-side validate only)
    blog/
      page.tsx                 # Blog Index
      [slug]/
        page.tsx                # Blog Post (MDX)
    gallery/
      page.tsx
    events/
      page.tsx
      [slug]/
        page.tsx
    about/
      page.tsx
    contact/
      page.tsx
    faq/
      page.tsx
    sitemap.ts                  # Next.js dynamic sitemap
    robots.ts
    not-found.tsx
    opengraph-image.tsx          # dynamic OG image (optional, nice touch)
  content/                       # THE SINGLE SOURCE OF TRUTH for now
    courses.ts                   # typed array of Course objects — shaped like future GET /api/v1/courses response
    testimonials.ts
    events.ts
    faq.ts
    institute.ts                 # name, address, hours, socials, map embed
    blog/
      *.mdx                      # one file per post, frontmatter: title, slug, excerpt, date, cover, author, tags
  components/
    layout/
      Header.tsx                 # sticky nav, mobile Sheet menu
      Footer.tsx
      MobileNav.tsx
    sections/
      Hero.tsx
      StatsStrip.tsx              # "500+ students trained", "12 years", etc. [PLACEHOLDER numbers]
      CourseGrid.tsx
      CourseCard.tsx
      WhyChooseUs.tsx
      TestimonialCarousel.tsx
      CTABanner.tsx
      FAQAccordion.tsx
      NewsletterSignup.tsx        # client-only stub for now
    forms/
      AdmissionInquiryForm.tsx
      ContactForm.tsx
    ui/                            # shadcn primitives live here (auto-generated)
    common/
      SectionHeading.tsx
      Container.tsx
      Breadcrumbs.tsx
      Badge.tsx (module status/level pill — reuses design token pattern from StatusBadge in the full spec)
  lib/
    seo.ts                         # generateMetadata helpers, JSON-LD builders
    utils.ts                       # cn(), formatters
    constants.ts
  messages/                        # only if Nepali is in scope this phase — see §9
    en.json
    ne.json
  types/
    course.ts
    testimonial.ts
    event.ts
    blog-post.ts
public/
  images/
    courses/
    gallery/
    team/
    logo/
```

**Rule carried over from the full frontend spec:** components never hard-code copy that belongs in `content/` — every string a client will eventually want to edit lives in a content file, not inline in JSX. This is what makes the later CMS migration (Part 3) a data-source swap instead of a rebuild.

---

## 5. Content Data Shapes (forward-compatible with the future API)

Define these now, exactly as the future backend will return them, so `content/courses.ts` can later be replaced by a `fetch()` call with **no component changes**.

```typescript
// types/course.ts
export interface Course {
  id: string;
  slug: string;
  title: string;
  category: string;            // e.g. "Office & Productivity", "Programming", "Design"
  level: "Beginner" | "Intermediate" | "Advanced";
  durationWeeks: number;
  feeNPR: number;
  feeNote?: string;             // e.g. "Installments available"
  shortDescription: string;
  fullDescription: string;
  syllabus: { title: string; topics: string[] }[];
  prerequisites?: string;
  outcomes: string[];           // "What you'll be able to do"
  schedule: string;             // e.g. "Mon–Fri, 2 hrs/day" — static text for now, real batches come later
  image: string;
  featured?: boolean;
  seats?: string;               // "Limited seats" style copy — no live capacity yet
}
```

Mirrors `courses` table fields already defined in Part 1 §11.4 (title, description, syllabus, duration, fee, prerequisites) — same field names, so a future Prisma → API → frontend type generation step lines up directly.

Same pattern applies to `testimonials.ts`, `events.ts`, and blog frontmatter — each field name should match what Part 3's CMS will eventually store.

---

## 6. Page-by-Page Content & Section Plan

### 6.1 Home (`/`)
1. **Header** — logo `[PLACEHOLDER]`, nav (Home, Courses, About, Blog, Gallery, Events, Contact), prominent "Enquire Now" CTA button.
2. **Hero** — headline + subheadline + primary CTA ("Explore Courses") + secondary CTA ("Book a Free Demo Class"). Background: subtle geometric pattern or a real classroom photo `[PLACEHOLDER]`.
3. **Stats strip** — 4 numbers: years running, students trained, courses offered, placement/certification rate `[PLACEHOLDER numbers, clearly marked as illustrative until real figures supplied]`.
4. **Popular Courses** — 6-card grid pulling `featured: true` courses from `content/courses.ts`, "View All Courses" link to `/courses`.
5. **Why Choose Darbar Computer** — 4–6 feature tiles (Certified Trainers, Practical Lab Access, Placement Support, Flexible Batches, Affordable Installments, Government-Recognized Certification `[verify claim before publishing]`).
6. **How It Works** — 3–4 step process: Inquire → Free Counseling/Demo → Enroll & Pay → Start Learning.
7. **Testimonials** — carousel, 4–6 entries `[PLACEHOLDER — needs real student quotes + consent]`.
8. **Upcoming Events** — 2–3 cards from `content/events.ts`.
9. **CTA Banner** — "Ready to start your course?" with inquiry link + phone number.
10. **Footer** — address, hours, social links, quick nav, newsletter signup stub, copyright.

### 6.2 Course Catalog (`/courses`)
- Filter bar (category, level) — client-side filter over the static `courses.ts` array, no backend needed.
- Search input (simple client-side string match for now — Meilisearch is a Phase-2 concern per frontend spec §1, not needed for a static preview).
- Responsive grid of `<CourseCard>` (image, title, level badge, duration, fee, "View Details").
- Empty state if filters return nothing (reuse the `<EmptyState>` pattern from the full spec §13).

### 6.3 Course Detail (`/courses/[slug]`)
- Breadcrumb, title, category/level badges, hero image.
- Tabs or stacked sections: Overview, Syllabus (accordion per module), Outcomes, Prerequisites, Fee & Schedule.
- Sticky sidebar card (desktop) / bottom sheet (mobile): fee, duration, "Enquire About This Course" button pre-filling the inquiry form's course field.
- Related courses (same category) at the bottom.
- `generateStaticParams()` over all courses in `content/courses.ts`; `generateMetadata()` per course for SEO.

### 6.4 Admission Inquiry (`/admissions/inquire`)
- Form fields: full name, phone, email, course of interest (select, pre-fillable via `?course=slug` query param from Course Detail CTA), preferred batch time, message.
- Zod schema named `CreateLeadSchema` — matches the shape the future CRM/Admissions lead-intake endpoint (Part 3) will expect, per the frontend spec's forms convention (§6).
- On submit (this phase only): client-side validation → success toast → **no real network call** — either log payload to console with a clear `// TODO: POST /api/v1/leads once Part 3 backend exists` comment, or open a `mailto:` fallback so the form is genuinely usable during the testing phase.

### 6.5 About (`/about`)
- Institute story `[PLACEHOLDER copy]`, mission/vision, facilities (lab photos), leadership/trainer profiles (photo, name, specialty) `[PLACEHOLDER]`, affiliations/certifications logos if any `[PLACEHOLDER, verify legitimacy before publishing any claimed affiliation]`.

### 6.6 Blog (`/blog`, `/blog/[slug]`)
- Index: card grid, tag filter, pagination (or "load more").
- Post: MDX-rendered, cover image, author, date, reading time, related posts.
- Ship with 3–4 sample posts `[PLACEHOLDER content]` so the layout isn't empty during review — clearly draft/sample tagged.

### 6.7 Gallery (`/gallery`)
- Masonry or grid lightbox of classroom/lab/event photos, filterable by category (Classroom, Lab, Events, Certificates).

### 6.8 Events (`/events`, `/events/[slug]`)
- Upcoming/past toggle, event card (date, title, short description), detail page with full description + location + RSVP-style inquiry CTA (reuses the inquiry form).

### 6.9 Contact (`/contact`)
- Address, phone, email, embedded map (Google Maps iframe, no API key needed for a basic embed), business hours table, contact form (same pattern as Admission Inquiry).

### 6.10 FAQ (`/faq`)
- Accordion grouped by category (Admissions, Fees, Courses, Certificates) — pulls from `content/faq.ts`.

### 6.11 Utility routes
- `sitemap.ts`, `robots.ts` — auto-generated from the route list + `courses.ts`/blog posts.
- `not-found.tsx` — branded 404 with search + link back to Home/Courses.
- `opengraph-image.tsx` — one branded template reused with per-page title (optional but cheap, high polish payoff).

---

## 7. Design System — Proposed Tokens (needs client sign-off)

No brand colors exist yet in the source documents. Below is a **proposed, professional palette** appropriate for a computer training institute — trustworthy, tech-forward, warm enough not to feel cold/corporate. Treat as a strong starting proposal, not final until approved.

| Token | Value (proposed) | Usage |
|---|---|---|
| `--primary` | Deep indigo/blue `#1E3A8A`–`#1D4ED8` range | Header, primary buttons, links |
| `--secondary` | Warm amber/gold `#D97706`–`#F59E0B` range | Accents, highlights, "featured" badges — evokes achievement/certification without looking gaudy |
| `--accent` | Teal `#0D9488` | Secondary CTAs, icons, hover states |
| `--success` / `--warning` / `--danger` | Standard Tailwind green/amber/red | Form states, badges |
| `--neutral-{50…900}` | Tailwind slate/zinc scale | Text, backgrounds, borders |
| Typography | **Inter** (headings + body) | Clean, highly legible, professional — matches full spec §3.1 |
| Devanagari (if in scope) | **Noto Sans Devanagari** | Only loaded on `ne` locale per §9 |
| Radius | `rounded-md` inputs/buttons, `rounded-lg` cards, `rounded-full` avatars/badges | Per full spec §3.1 |
| Shadow | `shadow-sm` cards, `shadow-md` dropdowns, `shadow-lg` modals | Per full spec §3.1 |
| Breakpoints | `sm:640 md:768 lg:1024 xl:1280` | Public site is mobile-first from 320px per §3.1 |

All tokens defined as CSS variables in `globals.css`, mapped into `tailwind.config.ts` — **never hard-code a hex value in a component.** This is a hard rule carried directly from the full frontend spec §3.1 and is what lets the whole site be re-themed later for multi-branch (Part 1 §7.1) by editing one file.

"Premium" in practice means: generous whitespace, a strict 4/8px spacing rhythm, no more than 2 typefaces, one accent color used sparingly (not everywhere), high-quality real photography over stock/clipart wherever possible, and consistent card/shadow treatment across every section — not heavier decoration.

---

## 8. Placeholder Course Catalog (ships with the build so it's never empty)

`[PLACEHOLDER — replace with Darbar Computer's real, approved course list and pricing before public launch]`. A realistic starter set for a general computer training institute:

| Category | Sample Courses |
|---|---|
| Office & Productivity | Computer Fundamentals & MS Office, Advanced Excel, Nepali/English Typing |
| Programming | Web Development (HTML/CSS/JS), Python Programming, Full-Stack Web Development |
| Design | Graphic Design (Photoshop/Illustrator), UI/UX Design Basics, Video Editing |
| Accounting & Business | Computerized Accounting (Tally/QuickBooks), Digital Marketing |
| Hardware & Networking | Computer Hardware & Networking, A+ / Networking Fundamentals |
| Short/Certificate Courses | Basic Computer Literacy, Freelancing Skills Bootcamp |

Populate `content/courses.ts` with ~10–14 entries across these categories so the catalog, filters, and card grid all look populated and realistic for review, each flagged as sample data in a code comment at the top of the file.

---

## 9. Internationalization — Scope Decision for This Phase

The full spec requires English + Nepali from day one (frontend spec §8) with Bikram Sambat calendar as an **explicitly open decision** (§14). For this static preview build, two honest options:

- **Option A (recommended for speed):** Ship English-only for the first reviewable build; wire `next-intl` scaffolding and the `messages/en.json` structure now (so it's not a later rewrite) but defer producing `ne.json` translations until content is finalized and a translator is available — retranslating placeholder copy twice wastes effort.
- **Option B:** Build bilingual from day one if Nepali content is ready now.

Recommendation: **Option A.** Get the design/IA approved in English first — content and layout are far more likely to change during review than the i18n plumbing is.

---

## 10. SEO & Performance Requirements

Carried directly from the full spec (§9) since these apply to a public marketing site regardless of build phase:

- **Rendering:** every route in this build is SSG (`generateStaticParams` for courses/blog/events) — no client-only rendering needed since there's no auth-gated content here.
- **Metadata:** `generateMetadata()` per page — unique title/description, Open Graph tags, canonical URL.
- **Structured data (JSON-LD):** `EducationalOrganization` schema on Home/About, `Course` schema on each course detail page, `BlogPosting` on posts — helps real SEO once the site goes live and gives it a head start.
- **Images:** `next/image` everywhere, explicit `sizes`, compressed source assets.
- **Bundle budget:** target <200KB gzipped first-load JS per route, per the full spec's public-route budget (§9).
- **Lighthouse target:** 95+ across Performance/Accessibility/Best Practices/SEO — test before calling any page "done."
- **Accessibility:** WCAG 2.2 AA — axe-core in CI (or at minimum, run manually before each review milestone), color contrast validated against the token set (§7), full keyboard navigation, all icon-only buttons get `aria-label`.

---

## 11. Build Plan — Milestones

| Milestone | Deliverable | Est. effort |
|---|---|---|
| **M0 — Scaffold** | Repo set up per §3–§4, design tokens in `globals.css`, fonts loaded, Header/Footer shell, deployed empty shell to Vercel preview | 0.5–1 day |
| **M1 — Design system + Home** | Hero, Stats, WhyChooseUs, CTABanner, Footer fully styled with placeholder content; this page alone should be enough to get a "yes, this direction works" from stakeholders | 1–2 days |
| **M2 — Course Catalog + Detail** | `content/courses.ts` populated (§8), catalog grid + filters, course detail template, inquiry CTA wired to the form's query param | 1–2 days |
| **M3 — Admissions/Contact forms** | Zod-validated forms, success/error states, `mailto:`/console-log fallback submission | 0.5 day |
| **M4 — Blog, Gallery, Events, About, FAQ** | Remaining routes, sample MDX posts, gallery grid, events list/detail | 1–2 days |
| **M5 — SEO + Performance + a11y pass** | Metadata/JSON-LD on every route, sitemap/robots, Lighthouse pass, axe-core pass, mobile QA on real devices | 1 day |
| **M6 — Stakeholder review** | Walkthrough with institute leadership, collect real content (§1), punch-list fixes | ongoing |

Total: roughly **1–1.5 weeks** for one frontend developer to reach a polished, reviewable static site, before any real content or backend integration.

---

## 12. Acceptance Checklist (before calling this build "done" for testing)

- [ ] Every route in §6 exists, renders, and is linked from nav/footer with no dead links.
- [ ] Site is fully responsive from 320px to desktop — no horizontal scroll, no overlapping elements at any breakpoint.
- [ ] Design tokens used exclusively — zero hard-coded hex colors in component files (grep check).
- [ ] Every image uses `next/image` with proper `sizes`; no layout shift on load.
- [ ] Admission Inquiry and Contact forms validate correctly and give clear success/error feedback, even without a real backend.
- [ ] Lighthouse: Performance ≥ 90 (target 95+), Accessibility ≥ 95, SEO = 100 on Home, Courses, and one Course Detail page.
- [ ] axe-core reports zero critical/serious violations on the same three pages.
- [ ] Keyboard-only pass: can reach and activate every interactive element (nav, filters, form fields, accordion) without a mouse.
- [ ] All `[PLACEHOLDER]` items are collected into a single punch-list handed back to the client (logo, colors, real courses/pricing, photos, testimonials, address/contact, stats).
- [ ] Deployed to a shareable Vercel/Netlify preview URL for stakeholder review.

---

## 13. Migration Path — What Happens After This Phase

This build is deliberately structured so the transition to the real platform is additive, not a rewrite:

1. **Part 3 lands (Website CMS, Blog CMS, CRM/Admissions API)** → replace `content/courses.ts`, `content/blog/*.mdx`, `content/events.ts` reads with TanStack Query hooks calling the real endpoints; component props/shapes stay the same because §5's types were written to match the future API.
2. **Admission Inquiry / Contact forms** → swap the console-log/`mailto:` submit handler for a real `POST /api/v1/leads` call; the Zod schema and form UI don't change.
3. **`(auth)`, `(portal)`, `(console)` route groups** get added alongside `(public)` in the same codebase, per the full frontend spec §2 — this repo becomes the seed for the complete three-experience application rather than being thrown away.
4. **Branding** — once real brand tokens are approved, it's a one-file edit to `globals.css`/`tailwind.config.ts`, not a component-by-component pass, because §7's rule (tokens only, never hard-coded) was followed from the start.

---

*This document should be re-issued as a new minor version once real branding, course data, and copy are received from Darbar Computer — the punch-list in §12 is the trigger.*
