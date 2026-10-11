# DarbarTech Website — Content Density Audit & Decluttering Plan

**Scope reviewed:** Home, About, Courses (listing + detail), Contact, FAQ, Header/Footer, Hero, and the underlying content model (`courses.ts`, `institute.ts`).

**Core finding:** The site isn't broken — the design system and code quality are solid — but almost every page over-explains itself. Sections repeat the same message in 2–3 formats, cards expose every data field the CMS has instead of the two or three that matter, and the homepage alone stacks 10 full-width sections before the footer. The fix is subtractive, not a redesign: cut sections, cut fields per card, cut repeated CTAs, and let whitespace do more of the work.

---

## 1. Homepage — 10 sections is too many

Current stack in `app/page.tsx`:

1. Hero (with animated code-rain background + 3 floating popup images)
2. Stats strip
3. Category directory
4. Course grid (6 featured courses)
5. Why Choose Us (grid of cards)
6. How It Works (4 steps)
7. Upcoming Events (3 cards)
8. Testimonials carousel
9. FAQ accordion
10. CTA banner

That's **10 distinct sections**, each with its own heading + description + grid, all competing for attention on one scroll. A first-time visitor never reaches a moment of rest — every section is announcing "here's more."

**Recommendation — cut to 6 sections:**

| Keep | Cut / merge | Why |
|---|---|---|
| Hero | — | Entry point, keep but simplify (see §2) |
| Course grid (Popular Courses) | Category directory | The category directory duplicates navigation already in the header/courses page. Fold categories into a simple filter *on* the courses page, not a separate homepage block. |
| Why Choose Us | Stats strip | Merge stats *into* the Why Choose Us section (e.g., small numbers under 3 of the 6 cards) instead of a standalone strip. Two "why trust us" blocks back-to-back is redundant. |
| Testimonials | How It Works | How It Works is useful but belongs on the Courses or Admissions page where someone is closer to enrolling — not the homepage, which should stay high-level. |
| FAQ (3–4 Qs only) | Upcoming Events | Move events off the homepage entirely; link to `/events` from the nav/footer instead. Events are time-sensitive content that shouldn't compete with evergreen homepage messaging. |
| CTA banner | — | Keep one strong closing CTA |

**Result:** Hero → Popular Courses → Why Choose Us (with stats folded in) → Testimonials → FAQ → CTA. Six sections, one CTA banner, no duplicated "why us" messaging.

---

## 2. Hero section — the biggest single offender

`Hero.tsx` is 667 lines and includes:

- An animated "code rain" background: 22 columns × 6 tokens = **132 floating code-language labels** (`JavaScript`, `const`, `SELECT`, `#include`, etc.) drifting behind the content
- 3 separate floating popup images layered on the hero photo (students counter, "complete" badge, mentor chat)
- A pill badge, animated ping dot, headline, subhead, paragraph, and two CTAs (a button + a secondary "Book a Free Consultation" tap target with its own icon and two lines of text)

This is a lot of *visual* noise even though the actual copy is short — it's the animation and layered decoration that make it feel busy, not the words.

**Recommendation:**
- Remove the code-rain background entirely, or reduce it to a single subtle static/looping accent (no more than ~12–16 tokens, lower opacity, one column pattern) — 132 animated labels is not a detail anyone consciously reads, but it does add flicker and cognitive load.
- Keep **one** floating popup image max (the strongest social-proof one, e.g., the students counter). Two extra popups on top of the photo plus the photo itself is three competing focal points in one visual.
- Keep the single primary CTA ("Browse Courses"). For the secondary action, use a plain text link ("or book a free consultation") instead of a second full button-style tap target — right now the hero has two visually-equal CTAs pulling in different directions.

---

## 3. Course cards & course detail pages — too many fields surfaced

### The data model itself is rich (37 courses × ~20 fields each in `courses.ts`):
`skillsGained`, `softwareTools`, `portfolioProjects`, `careerOpportunities`, `learningObjectives`, `overview`, `prerequisites`, `targetStudents`, `feeNote`, `seats`, `internship`, `industryCertification`, etc.

Having rich data is good for SEO and for the detail page. The problem is **how much of it gets rendered as visible UI blocks** on the course detail page (`app/courses/[slug]/page.tsx`, 524 lines):

- Header stat cards (4): Duration, Timing, Learning Mode, New Batch
- Tabs: Overview / Curriculum / Outcomes / Fees — and inside "Outcomes" alone there are **three separate list blocks**: Skills Gained, Portfolio Projects, Career Opportunities, each with its own heading, icon, and card styling
- Sidebar: a 5–6 item checklist repeating facts already shown in the header cards (duration, level, learning mode, certificate, internship) plus two CTA buttons

That's 4 header cards + 3–4 tabs + up to 3 list blocks per tab + a sidebar checklist that **restates the header cards** — a lot of surface area for one course.

**Recommendation:**
- Drop the sidebar checklist's overlap with the header stat cards. The sidebar should contain *only* what's not already visible above: certificate name, price/fee, and the CTA. Don't repeat duration/level/mode a second time.
- On the Outcomes tab, merge "Portfolio Projects" and "Career Opportunities" into one compact two-column list instead of two separate heading+card blocks — they're both "what you walk away with" and don't need separate visual treatment.
- Limit `skillsGained` display to 5–6 chips max (truncate the rest with a "+3 more" if the array is longer) rather than rendering every item in the array.

### Course cards on grid/listing pages (`CourseCard.tsx`, 141 lines)
Check how many badges/metadata rows are stacked on each card in the grid (category badge, level badge, duration, timing, certificate type, fee, CTA). If more than **3 metadata rows** appear on a grid card, cut to: category, duration, price/CTA. Everything else belongs on the detail page, not the card.

---

## 4. About page — merge Mission/Vision, trim team bios

- Mission and Vision are currently two separate cards with icons, headings, and full paragraphs side-by-side saying closely related things. Combine into a single short "What drives us" block (2–3 sentences), or keep two cards but cut each to one sentence.
- "Our Facilities" list — check the actual count in `institituteInfo.facilities`; if it's more than 6 items, cap the display at 6 with the rest omitted rather than growing the grid.
- Team member cards show name, role, and a specialty line — fine as is, but avoid adding bios/paragraphs here; keep it name + role + one line only.

---

## 5. Content model — cut what you collect, not just what you show

Some of this noise originates upstream, in `src/content/courses.ts`, which is explicitly marked as containing placeholder/estimated data (`feeNPR` and `Industry Certification` values are flagged as placeholders in the file's own comments). Before polishing the UI further:

1. Decide which of the ~20 fields per course are **actually load-bearing for a prospective student** (realistically: title, tagline, duration, level, fee, certificate, 4–5 skills, 1-line outcome). Everything else should be optional/secondary, not rendered by default.
2. Replace placeholder content (estimated fees, illustrative certifications) with real data before this ships — placeholder copy often *reads* as noisy because it's over-explaining to compensate for not having real specifics yet.

---

## 6. Repeated CTAs — count and consolidate

Right now there are CTA buttons in: Hero (×2), CTA Banner, every Course Card, Course Detail sidebar (×2), About page closing section, and likely the Contact/Admissions forms. This is expected for a lead-gen site, but audit for **near-duplicate CTAs stacked close together** (e.g., course detail sidebar has both "Get Batch Timing & Enrollment Details" and "Book Free Demo Class" — two buttons, same destination flow). Keep one primary action per section; if a secondary action is genuinely different, make it a text link, not an equal-weight button.

---

## 7. Quick-reference: what to cut, page by page

| Page | Cut | Keep |
|---|---|---|
| Home | Category directory block, Stats strip (as standalone), How It Works, Upcoming Events | Hero, Course grid, Why Choose Us (+ stats folded in), Testimonials, FAQ (short), 1 CTA |
| Hero | Code-rain animation (or shrink drastically), 2 of 3 floating popups, secondary button-style CTA | Headline, 1-line subhead, 1 primary CTA, 1 popup image |
| Course detail | Sidebar checklist duplicate facts, separate Portfolio/Career blocks, second CTA button, unbounded skills list | 4 header stat cards, tabs, merged outcomes list, 1 CTA + fee info |
| Course cards | Extra badges beyond 3 | Category, duration, price/CTA |
| About | Two full Mission/Vision cards | One merged "what drives us" block |
| Sitewide | Duplicate/near-duplicate CTAs in the same section | One clear primary action per section |

---

## 8. Suggested order of work

1. Trim the Hero (highest visual-noise-to-effort ratio fix).
2. Cut homepage from 10 → 6 sections.
3. Simplify the course detail sidebar + merge the two outcome lists.
4. Cap chip/list lengths everywhere (skills, facilities, badges) with a sane max + "+N more."
5. Replace placeholder content with real data so copy stops over-explaining to compensate.
6. Sweep for duplicate CTAs and cut to one per section.

This is roughly a 1–2 day pass for a developer already familiar with the codebase, since it's almost entirely deletion/consolidation of existing components rather than new design work.
