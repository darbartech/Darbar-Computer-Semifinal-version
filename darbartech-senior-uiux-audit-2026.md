# DarbarTech — Senior UI/UX Design Audit & 2026 Transformation Roadmap
**A full-site design and experience audit, written from the codebase as it stands today, with a prioritized transformation plan.**

I reviewed every page, component, form, and content file in the current build (not just the visual layer) — the goal here is to evaluate this the way a senior UI/UX designer would going into a design review before launch: does it look modern, does it *work*, does it convert, and does it hold up against what "good" looks like in 2026.

**Headline assessment:** The visual design system (color, typography, cards, buttons) is in genuinely good shape — clearly my/your earlier design-system work has already been implemented (corrected brand colors, animated nav underline, scroll shadow, `bg-secondary` testimonial section, sourced photography are all live in this build). That part of the job is largely done. What's *not* done, and what a senior review would flag hardest, is everything underneath the visual layer: **two lead-generating forms that silently rely on `mailto:` links, real business content still full of placeholder text, and a broken link in the footer.** Those are launch-blockers, not polish items. This document covers all of it, ranked by what actually matters.

---

## 1. Severity Legend

| Tag | Meaning |
|---|---|
| 🔴 **P0 — Launch Blocker** | Ships broken or actively loses the institute money/leads. Fix before going live. |
| 🟠 **P1 — High Impact** | Not broken, but meaningfully hurts conversion, trust, or usability. Fix in the first post-launch sprint. |
| 🟡 **P2 — Polish** | Elevates the site from "good" to "best-in-class." Do once P0/P1 are clear. |
| 🟢 **Already strong** | Called out so nothing is accidentally regressed. |

---

## 2. 🔴 P0 — Launch Blockers

### 2.1 Both lead-generation forms don't actually submit anywhere
`AdmissionInquiryForm.tsx` and `ContactForm.tsx` both validate correctly (Zod + react-hook-form, good field-level error messages), but on submit they do this:

```ts
const mailto = `mailto:info@darbarcomputer.edu.np?subject=...&body=...`;
window.location.href = mailto;
```

There's no `fetch()` call, no API route — it's a `console.log` stub plus a `mailto:` redirect. This is the single biggest UX problem on the site, because these two forms *are* the business's entire conversion funnel (admissions inquiries and contact requests):

- On mobile, if the visitor doesn't have a mail app configured (very common — many people only use Gmail's app, not the native mail client), the link does **nothing visible** or throws an OS-level "no app found" error. They'll assume the site is broken and leave.
- Even when it works, it yanks the visitor **out of the browser and into a separate app**, mid-conversion — a jarring context switch that most modern forms deliberately avoid.
- The toast message says "Our counselor will contact you within 1 business day," which is a promise the current flow can't back up — nothing was actually sent unless the visitor manually hits "send" in their email client afterward.
- There's no lead record anywhere (no database write, no CRM webhook, no email service call) — meaning **every inquiry that doesn't complete the manual mailto step is a completely lost lead with zero record it ever happened.**

**Fix:** Stand up a real submit path — a Next.js API route (`app/api/leads/route.ts`) that writes to a database or forwards to an email service (Resend/SendGrid) or a webhook (e.g., straight into Google Sheets or a CRM). Keep the `mailto:` as a `noscript`/fallback link only, never as the primary path. This is a backend task, not a design task, but it's the most important item in this entire document.

### 2.2 Footer "Popular Courses" links are broken (404)
`Footer.tsx` hardcodes these slugs:
```ts
const featuredCourses = ["computer-fundamentals-ms-office", "web-development-foundations", "full-stack-web-development", "graphic-design-photoshop-illustrator"];
```
None of these slugs exist in `src/content/courses.ts`. The actual slugs are `microsoft-office-professional`, `modern-frontend-engineering`, `mern-full-stack-engineering`, `creative-graphic-design-masterclass`, etc. Every visitor who clicks a "popular course" link in the footer — on every single page of the site, since the footer is global — lands on a 404. This is an easy fix but a costly bug to ship: it's the kind of thing search engines and users both penalize hard.

**Fix:** Pull this list dynamically from `getFeaturedCourses()` (already used on the homepage) instead of a hardcoded, drifting array.

### 2.3 Core business content is still placeholder text
`src/content/institute.ts` — the file that powers the footer, About page, and Contact page — has the real phone number, WhatsApp number, full street address, Google Maps embed, and founding story all marked `[PLACEHOLDER]`. The stats block (`12+ years`, `3,000+ students trained`, `98% certification rate`) is explicitly flagged `isPlaceholder: true` in the code.

This isn't a design issue, but it's a design-*adjacent* trust issue worth flagging loudly: a prospective student who can't find a real address or phone number, and who reads a founding story that's obviously a template, will bounce. For a local training institute, **local trust signals (real address, real map pin, real phone) are the single highest-leverage conversion factor** — more than any visual polish.

**Fix:** This needs the client's actual business info before launch, not a design change — flagging it here because it's currently the #1 blocker to the site being publishable at all.

---

## 3. 🟠 P1 — High-Impact UX Issues

### 3.1 Information architecture: FAQ and Admissions are "orphaned" pages
`NAV_LINKS` in `constants.ts` lists: Home, Courses, About, Blog, Gallery, Events, Contact. Two pages that exist and are fully built — `/faq` and `/admissions/inquire` — aren't in the primary nav at all.
- `/admissions/inquire` is only reachable via the "Enquire Now" button — which is actually fine, since it's meant to be a CTA, not a nav destination. No change needed there.
- `/faq` genuinely is missing from discovery. FAQ pages are high-intent, high-conversion pages (people who read FAQs are close to deciding) and right now the only way to find it is if it happens to be linked from the footer or homepage FAQ section.

**Fix:** Add "FAQ" to the footer's quick-links column at minimum; consider it a low-priority 8th nav item if the header has room, otherwise fold it into "About" as a sub-link.

### 3.2 15-category, 37-course catalog has no scent-of-information on the homepage
The homepage `CourseGrid` shows 6 hand-picked "Popular Courses," which is good, but with 15 categories total, a first-time visitor has no way to see the *breadth* of the catalog without clicking into `/courses` and manually exploring filters. In 2026, the expectation for a course catalog this large is a **visual category directory** — a scannable grid of the 15 categories (icon + name + course count) that lets people self-select their track before ever seeing individual course cards. This is both a UX improvement and an SEO one (internal links to category-filtered URLs).

**Fix:** Add a "Browse by Category" section between Hero/Stats and the Popular Courses grid — a responsive grid of 15 category chips/cards linking to `/courses?category=X`, each showing course count.

### 3.3 Course filter UX loses state on navigation, and has no result count
Reviewing `CoursesClient.tsx`: search, category, and level filters are `useState`, seeded once from URL params on mount — but changes to the filters don't sync back to the URL (no `router.push` on filter change). That means:
- The Back button won't restore a previous filter state.
- A filtered view can't be shared/bookmarked (e.g., "Web Development courses" as a link to send someone).
- There's no visible "Showing 8 of 37 courses" count, so users filtering aggressively don't get feedback on how narrow their search has become — a classic missing-affordance that increases perceived dead-ends ("did my filter break?").

**Fix:** Sync filter state to the URL query string on change (`router.replace` with `{ scroll: false }`), and add a small "Showing X of 37 courses" line above the grid.

### 3.4 No live chat / WhatsApp quick-contact, despite WhatsApp being defined in the data model
`instituteInfo.contact.whatsapp` exists in the content model but isn't used anywhere in the UI. For a Nepal-based local institute in 2026, **WhatsApp is very often the highest-converting contact channel** — often outperforming contact forms for exactly this kind of local service business, because it's instant and low-friction compared to filling out a form and waiting a day.

**Fix:** Add a persistent floating WhatsApp button (bottom-right, standard pattern) site-wide, and a prominent WhatsApp CTA alongside "Enquire Now" in the header on mobile.

### 3.5 `themeColor` in `layout.tsx` still references the old, uncorrected brand hex
```ts
export const viewport: Viewport = {
  themeColor: "#0F70A8", // old pre-correction primary
};
```
This is the browser-chrome/mobile-status-bar color (visible on Android Chrome, iOS Safari's tab bar, PWA splash). It was never updated when the brand palette was corrected to `#15678E`. Small, but it's a visible brand inconsistency on every mobile visit.

**Fix:** Update to `#15678E`.

### 3.6 No FAQPage structured data despite having a full FAQ page
2026 search behavior increasingly routes through AI answer engines (Google AI Overviews, ChatGPT search, Perplexity) rather than only traditional blue-link SERPs — often called **GEO (Generative Engine Optimization)** alongside classic SEO. The single highest-leverage, lowest-effort thing this site can do for that is adding `FAQPage` JSON-LD schema to `/faq` (and per-course FAQ blocks if any exist) — this is exactly the structured format answer engines pull from to cite a source directly. `courseJsonLd()` already exists for course pages, so the pattern is established — it just isn't extended to FAQs yet.

**Fix:** Add `faqJsonLd()` to `src/lib/seo.ts` mirroring the existing course schema pattern, and apply it in `app/faq/page.tsx`.

---

## 4. 🟡 P2 — Polish & 2026-Level Refinement

### 4.1 No dark mode
`globals.css` has no `prefers-color-scheme` handling at all. Dark mode is no longer a "nice to have" novelty — it's a baseline expectation for a 2026 site, particularly for evening-hour visitors (this audience skews toward working professionals researching courses after work). Given the navy/teal brand palette, a dark variant is a very natural fit (the navy `secondary` color practically *is* a dark-mode surface already).

**Fix:** Add a `dark:` variant pass using the existing neutral/primary/secondary tokens — surfaces map to `secondary/80–90`, text to `neutral-100/200`, primary teal stays vibrant as the accent (teal reads well on dark navy). Add a theme toggle in the header, defaulting to system preference.

### 4.2 No scroll-triggered motion / page feels static on load
Every section renders fully visible immediately with no reveal choreography. This isn't required, but subtle scroll-triggered fade/slide-up on section headings and cards (staggered ~80ms per child, per the earlier design-system doc §8) is one of the most reliable ways to make a site feel like a 2026 product rather than a 2019 template — as long as it's restrained (it already correctly avoids being gimmicky elsewhere, e.g. no autoplay carousels running wild).

**Fix:** Add a lightweight `useInView` + CSS transition reveal (Framer Motion or a simple Intersection Observer hook) to `SectionHeading` and grid children, capped at 400ms, never re-triggering on scroll-back.

### 4.3 Testimonials and course cards have no verification/trust signaling
In 2026, generic 5-star testimonial cards read as low-trust by default (too much AI-generated fake-review noise online has made users skeptical). Consider small trust upgrades: a "Verified Student" badge tied to a real course completion, a link to the student's LinkedIn (opt-in), or a short video testimonial thumbnail mixed into the carousel instead of 100% static text+photo cards.

### 4.4 No visible search across the whole site (only within `/courses`)
The course-catalog search box only searches courses. There's no global search (courses + blog + FAQ + events) accessible from the header. For a site with 37 courses, 5+ blog posts, an events calendar, and an FAQ, a global `Cmd+K`-style search palette is a very "2026 SaaS-grade" pattern that meaningfully reduces time-to-answer for visitors who arrive with a specific question in mind. Lower priority than the P0/P1 items, but a strong differentiator versus competing local institute sites, which almost never have this.

### 4.5 Accessibility pass needed on interactive icon-only elements
Spot-checked `Header.tsx` and `Sheet` usage — labels are present on the icon-only mobile-menu trigger (`aria-label="Open menu"`), which is good. Recommend a full pass on: focus-visible ring consistency across `Select`/`Tabs`/`Accordion` (verify they inherit the `--color-ring` token rather than browser default blue), color-contrast check on the `neutral-400` placeholder text used in inputs (at `#a1a1aa` on white this sits right around 2.9:1 — below the 3:1 minimum for UI component text), and a keyboard-only walkthrough of the course filter Sheet on mobile.

---

## 5. 🟢 What's Already Strong (don't regress these)

- **Brand color system** — corrected teal/navy hex values are live and consistent across `globals.css`, `DarbarTechLogo.tsx`, and `layout.tsx` metadata (aside from the one `themeColor` miss in §3.5).
- **Header** — scroll-aware shadow, animated underline active-state, and a properly labeled mobile `Sheet` menu are all implemented well.
- **Testimonials section** — correctly uses the navy `bg-secondary` full-bleed treatment recommended for visual rhythm.
- **Course photography** — real, properly licensed Pexels/Unsplash imagery is wired into `courses.ts` and `gallery.ts` via the `img()` helper, replacing what would otherwise be AI-placeholder images.
- **Forms' client-side validation** — Zod schemas with specific, human-readable error messages (e.g., regex-validated name/phone fields) — the validation layer itself is well built; it's only the submission layer that's missing.
- **SEO fundamentals** — `courseJsonLd()`, per-page `buildMetadata()`, sitemap/robots routes all present — a stronger technical SEO foundation than most local institute sites ship with.

---

## 6. 2026 Design Trends Worth Adopting (and ones to skip)

A senior review in 2026 should separate genuine trend-adoption from trend-chasing. Here's the honest split for a training-institute site specifically:

**Worth adopting:**
- **AI-answer-engine optimization (GEO)** — §3.6 FAQ schema, plus writing course descriptions and blog posts in a more directly "quotable" Q&A structure, since a growing share of prospective-student research now happens inside AI chat tools rather than Google's blue links.
- **WhatsApp/chat-first contact** — §3.4 — genuinely the highest-converting channel for this exact business type in this exact market.
- **Dark mode** — §4.1 — now table-stakes, and cheap given the existing token system.
- **Bento-grid layouts for dense info** (e.g., the "Every Course Includes" 8-item benefit list, or the category directory in §3.2) — bento grids remain a strong 2026 pattern specifically for turning a flat list into a scannable, visually varied block, better than another 4-column icon row.

**Worth skipping (would hurt more than help here):**
- **Heavy 3D/WebGL hero scenes** — trendy on SaaS/product sites, but adds load time and doesn't serve a training institute's core job (clear info, fast trust, easy inquiry) — actively works against the mobile-first, sometimes-slower-connection reality of the target audience.
- **AI chatbot as primary contact method** — an AI chat widget is tempting to add for novelty, but for a local institute, a human WhatsApp line and a working form will out-convert a bot every time; don't let a chatbot *replace* real human contact channels, only ever supplement them once the core funnel (§2.1) is fixed.
- **Glassmorphism-heavy UI** — was trendy a couple of cycles ago and is now reading as dated rather than fresh; the current clean-card, solid-color approach already photographs better for 2026 taste.

---

## 7. Prioritized Roadmap

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | Wire both forms to a real backend (API route + email/CRM) | Medium (needs backend) | Critical — currently losing every lead that doesn't manually complete a mailto |
| 🔴 P0 | Fix Footer's hardcoded broken course slugs | Trivial | High — global 404s on every page |
| 🔴 P0 | Replace placeholder business info (phone, address, story, stats) | N/A (client content) | Critical — trust and launch-readiness |
| 🟠 P1 | Add FAQ to nav/footer discovery | Trivial | Medium |
| 🟠 P1 | Add "Browse by Category" directory to homepage | Medium | High — discoverability of 37-course catalog |
| 🟠 P1 | Sync course filters to URL + add result count | Small | Medium — shareability, perceived responsiveness |
| 🟠 P1 | Add WhatsApp floating button + header CTA | Small | High — likely top conversion channel for this market |
| 🟠 P1 | Fix stale `themeColor` hex | Trivial | Low-Medium (visible brand polish) |
| 🟠 P1 | Add FAQPage JSON-LD | Small | Medium — AI/search discoverability |
| 🟡 P2 | Dark mode | Medium | Medium |
| 🟡 P2 | Scroll-reveal motion pass | Small-Medium | Polish |
| 🟡 P2 | Trust-signal upgrades on testimonials | Small | Polish/trust |
| 🟡 P2 | Global `Cmd+K` search | Medium-Large | Differentiator, not essential |
| 🟡 P2 | Full accessibility pass (contrast, focus-visible audit) | Medium | Compliance + broader reach |

---

## 8. Bottom Line

If this were a real design review, the verdict would be: **the visual design is release-ready; the product is not.** A beautifully styled form that doesn't submit anywhere is worse than an ugly one that works — it actively costs the business enrollments while looking like everything is fine. Fix §2 first, in this order: forms → footer links → real content. Everything in §3 and §4 is genuinely valuable but won't matter if the two forms that generate every lead the institute gets are silently failing on launch day.
