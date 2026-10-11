# DarbarTech Website — Improvement Audit & Implementation Plan

**Project:** darbar-computer-site (Next.js 14+ / App Router / TypeScript / Tailwind)
**Prepared for:** DarbarTech Group of Technology
**Scope:** Deep audit of the existing codebase against the client's revision brief, with concrete, file-level fixes for each item.
**Status:** Planning document — no code has been changed yet. This is the spec to implement against.

---

## 0. How to read this document

Each section below covers **one requirement from the client brief**. For every item you get:

1. **Current behavior** — what the code does today, with exact file/line references.
2. **Why it's a problem** — UX, brand, or SEO reasoning.
3. **Fix specification** — exactly what to change, including code-level guidance.
4. **Acceptance criteria** — how to verify it's actually fixed.

A consolidated **priority checklist** and **effort estimate** is at the end (Section 10).

---

## 1. Logo size in Header and Footer

### Current behavior
`src/components/common/DarbarTechLogo.tsx` renders the logo via a fixed height map:

```ts
const sizeMap = { sm: 32, md: 36, lg: 44 }; // px height
```

- **Header** (`src/components/layout/Header.tsx:52`) uses `size="md"` → **36px** tall, inside a `h-14 sm:h-16` bar. Relative to the header height, the logo occupies roughly 45–50% of the bar height, and the width is derived from a fixed `1.942` aspect ratio multiplier — it reads visually small next to the nav links and CTA button.
- **Mobile sheet header** (`Header.tsx:114`) uses `size="sm"` → **32px**, even smaller.
- **Footer** (`src/components/layout/Footer.tsx:125`) uses `size="lg"` → **44px**, against a large dark footer column — still under-sized relative to the whitespace around it.

### Why it's a problem
Logo is the primary brand mark and trust signal above the fold. At 36px it competes poorly with 16px nav text and don't provide the visual anchor a training institute brand needs, especially on retina/HD displays where a small raster logo can look soft.

### Fix specification
1. In `DarbarTechLogo.tsx`, increase the size map:
   ```ts
   const sizeMap = { sm: 40, md: 48, lg: 60 };
   ```
2. In `Header.tsx`, bump the header bar height slightly to accommodate the larger mark without crowding:
   ```tsx
   // from: h-14 sm:h-16
   className="flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-3"
   ```
3. Use `size="md"` (now 48px) in the desktop header, `size="sm"` (now 40px) in the mobile sheet — both are a clear step up without breaking the sticky-header layout.
4. In `Footer.tsx`, use `size="lg"` (now 60px) — the dark footer has ample vertical space (`pt-14 sm:pt-16 lg:pt-20`) to absorb this.
5. **Source asset check:** `public/images/logo/final-logo.png` must be re-exported at minimum **2x the largest rendered size** (i.e. at least 120px tall @2x, ideally an SVG) so it stays crisp — the `<Image>` component upscaling a small PNG will look blurry at 60px. If only a PNG is available, request/regenerate a ≥400px-tall source PNG or, better, an SVG logo file.
6. Add explicit `priority` to the header's logo `<Image>` (it's above the fold on every page) to avoid layout shift/lazy-load flash.

### Acceptance criteria
- Header logo renders at 48px height desktop / 40px mobile, footer at 60px, with no blur at 2x DPR.
- `--header-h` CSS var (used by `CoursesClient.tsx` sticky filter bar, see §3) is updated to match the new header height so the sticky filter bar doesn't overlap the header.

---

## 2. Remove the "Not sure which course is right for you?" counselor CTA block

### Current behavior
This is the `CTABanner` component (`src/components/sections/CTABanner.tsx`), used in **3 places**:
- `app/page.tsx` (homepage, last section before footer)
- `app/faq/page.tsx`
- `app/admissions/inquire/page.tsx`

The exact copy the client wants removed lives at `CTABanner.tsx:27–31`:
```tsx
<h2 id="cta-heading">Not sure which course is right for you?</h2>
<p>Talk to a course counselor free — no obligation, no pressure. We'll recommend the right track based on your goals, background, and timeline.</p>
```

### Fix specification
Two valid approaches — recommend **Option A**:

**Option A — Remove only from the homepage** (most likely client intent, since it's the most repetitive placement and homepage is already CTA-heavy with Hero + CourseGrid CTAs):
- Delete the `<CTABanner />` line from `app/page.tsx`.
- Leave it on `/faq` and `/admissions/inquire`, where "talk to a counselor" is contextually the *right* next step (a user reading FAQs or already on the inquiry page benefits from a human-contact nudge).

**Option B — Remove the component entirely, site-wide:**
- Delete `<CTABanner />` usage from all 3 pages.
- Delete `src/components/sections/CTABanner.tsx`.
- Replace the homepage's final section with a lighter, single-line closing strip (e.g. a simple "Ready to start? [Enquire Now]" bar) so the page doesn't end abruptly on the FAQ accordion.

> **Decision needed from client:** confirm whether this section should be removed *everywhere* or just decluttered from the homepage. Implementation defaults to Option A unless told otherwise.

### Acceptance criteria
- Section no longer appears on the homepage.
- Homepage still ends with a clear closing CTA (via Hero/CourseGrid's existing CTAs) — page doesn't end on the FAQ accordion with no next action.
- No broken imports/unused-component lint warnings left behind.

---

## 3. Course category filter — consolidate into simplified top-level groups

### Current behavior
`src/lib/constants.ts:18-34` defines **15 granular categories**:
```
Basic Computer, Office & Productivity, Programming, Web Development,
AI & Automation, Data Science, Cloud & DevOps, Graphic Design,
Video Production, Business & Accounting, Networking, Cyber Security,
Digital Marketing, Career Programs, Professional Diploma
```
This full list populates the filter `<Select>` on `/courses` (`app/courses/CoursesClient.tsx:34, 288, 291`) as a **flat, unsorted dropdown** — a first-time visitor has to scan 15 options with no grouping logic, several of which (`Web Development` vs `Programming`, `Career Programs` vs `Professional Diploma`) are not obviously distinct to a non-technical parent/student — DarbarTech's actual audience.

### Why it's a problem
- 15 flat options in a `<select>` is a poor mobile UX (long native picker scroll).
- Categories overlap conceptually, causing decision fatigue for the primary personas (SEE/+2 students, career-switchers, parents).
- The client explicitly asked for a small, intuitive set: **Basic Computer, Programming, Data Science, Graphics Design, Digital Marketing, Special (etc.)**

### Fix specification
Introduce a **two-tier category model**: keep the 15 detailed categories at the *data* level (needed for accurate course metadata, SEO course-detail pages, and structured data), but expose a **simplified parent-group filter** in the UI.

**3.1 — Add a category-group mapping in `src/lib/constants.ts`:**
```ts
export const COURSE_CATEGORY_GROUPS = [
  {
    id: "basic-computer",
    label: "Basic Computer",
    categories: ["Basic Computer", "Office & Productivity"],
  },
  {
    id: "programming",
    label: "Programming",
    categories: ["Programming", "Web Development", "AI & Automation", "Cloud & DevOps"],
  },
  {
    id: "data-science",
    label: "Data Science",
    categories: ["Data Science"],
  },
  {
    id: "graphics-design",
    label: "Graphics Design",
    categories: ["Graphic Design", "Video Production"],
  },
  {
    id: "digital-marketing",
    label: "Digital Marketing",
    categories: ["Digital Marketing"],
  },
  {
    id: "special",
    label: "Special Programs",
    categories: [
      "Business & Accounting",
      "Networking",
      "Cyber Security",
      "Career Programs",
      "Professional Diploma",
    ],
  },
] as const;
```
This is additive — it does **not** remove the granular `category` field already on each `Course` object (used on course detail pages, breadcrumbs, and JSON-LD), it just adds a UI-level grouping layer on top.

**3.2 — Update the filter UI in `app/courses/CoursesClient.tsx`:**
- Replace the flat `allCategories` dropdown with the 6 grouped chips/tabs (order matters — put them in the order the client listed: Basic Computer → Programming → Data Science → Graphics Design → Digital Marketing → Special).
- Filtering logic changes from an exact string match to a membership check:
  ```ts
  const filtered = courses.filter((c) => {
    if (categoryGroup !== "All") {
      const group = COURSE_CATEGORY_GROUPS.find((g) => g.id === categoryGroup);
      if (!group?.categories.includes(c.category)) return false;
    }
    // ...existing level/search checks
  });
  ```
- Optionally render the **6 group chips as pill/tab buttons** above the search bar (better mobile UX than a native select for only 6 options), with the existing native `<Select>` kept only for the "Level" filter and/or as a secondary sub-filter once a group is picked.
- Update the mobile filter Sheet (`CoursesClient.tsx:286-301`) to use the same 6-group options.

**3.3 — Sort order:** within each group, sort courses by `level` (Beginner → Advanced) then alphabetically, so results feel intentional rather than data-entry order.

### Acceptance criteria
- `/courses` filter shows exactly 6 top-level groups (+ "All"), matching the client's requested labels.
- Selecting "Programming" correctly returns all courses whose underlying category is Programming, Web Development, AI & Automation, or Cloud & DevOps.
- URL query params (`?category=...`) still work for deep-linking/SEO (update param values to the new group `id`s, e.g. `?category=programming`).
- No regression to course-detail pages, which keep showing the specific/granular category (e.g. "Web Development") in breadcrumbs and metadata — grouping is a filter-only concept.

---

## 4. Images — remove random/generic imagery, use unique HD images per item

### Current behavior
`src/content/courses.ts:8-27` — a helper function `img(category, index)` maps **each of the 15 course categories to exactly one static Pexels stock URL**, and the `index` parameter (meant to vary the image per course) **is unused** (`_index`, flagged with an eslint-disable comment):

```ts
function img(cat: string, _index: number) {
  const categoryMap: Record<string, string> = {
    basic: "https://images.pexels.com/photos/574069/...",
    // ... 15 total
  };
  return categoryMap[cat] ?? categoryMap.programming;
}
```

Result: **all 3 "Basic Computer" courses show the identical photo**, all courses in "Programming" show the identical photo, etc. Across 37 courses there are only **15 unique images total**, and several categories (`Programming` has multiple courses) repeat the exact same stock photo on the `/courses` grid, on course detail pages, and in the footer's "Popular Courses" — this is highly visible repetition to any visitor browsing more than 2 courses.

The `about` page's campus image (`src/content/institute.ts:1-2`) is a single generic stock photo unrelated to the actual DarbarTech campus, and the Google Maps embed uses **literal placeholder text**:
```
!1sPLACEHOLDER!2sPLACEHOLDER ... 4vPLACEHOLDER
```
— meaning the embedded map on `/contact` and the footer currently either fails to render or points nowhere.

### Why it's a problem
- Repeated stock imagery reads as templated/low-effort and hurts perceived credibility for a training institute competing on "hands-on, real labs" positioning.
- Generic stock photography (people in unrelated offices, not Nepal/Kathmandu, not DarbarTech's actual classrooms) undermines authenticity — this is explicitly what the client flagged as "random image and content."
- A broken map embed on the contact page is a functional bug, not just a content issue.

### Fix specification

**4.1 — One unique image per course (37 unique images minimum), sourced and licensed properly:**
- Replace the category-keyed `img()` helper with a **per-course `image` field**, each pointing to a distinct, topically-relevant, high-resolution (≥1600px wide) photo.
- Preferred sourcing priority:
  1. **Real DarbarTech photos** (actual classroom/lab/student photos) — best for authenticity and uniqueness; ask the client for a batch of campus/classroom photography.
  2. If real photos aren't available yet, use royalty-free HD stock (Pexels/Unsplash) but ensure **no two courses share a photo**, and prefer images that visually match the specific skill (e.g. a Python course gets a photo showing actual Python code/IDE on screen, not a generic "person typing" stock shot used elsewhere).
- Store final chosen URLs (or downloaded + self-hosted files under `public/images/courses/<slug>.jpg`) — self-hosting is strongly preferred over hot-linking Pexels CDN URLs, for reliability, performance (Next/Image optimization needs control over the source), and to avoid third-party CDN downtime affecting the live site.
- Update `Course` image field to be **required and course-specific**, not derived from a shared category map. Delete the unused `_index` parameter and the `categoryMap` fallback pattern.

**4.2 — Every image site-wide should be unique, not reused across sections:**
- Audit and replace duplicate use of the same stock photo across: Hero background, About page, course cards, gallery, blog post cover images, testimonial avatars.
- Testimonial avatars in particular (`src/content/testimonials.ts` — verify) commonly reuse the same 3–4 generic headshots; replace with distinct headshots or switch to initials/avatar-placeholder components if real student photos aren't available/consented.

**4.3 — Fix the contact map embed:**
- Replace the `PLACEHOLDER` values in `instituteInfo.contact.mapEmbed` (`src/content/institute.ts`) with DarbarTech's real Google Maps "Embed a map" iframe code (client needs to provide the actual campus location pin, or you generate it from the real address once available — see §6).

**4.4 — Image optimization guardrails (SEO + perf, ties into §7):**
- All course/gallery/blog images should go through `next/image` with proper `sizes`, `alt` text describing the *specific* course/subject (already partially done — extend to be more descriptive per image rather than the generic `"${course.title} - DarbarTech course"` pattern currently in `CourseCard.tsx:40`, e.g. `"Students practicing ${skill} in a hands-on lab session — ${course.title} at DarbarTech"`).
- Compress/serve `.webp` or `.avif` where the source allows it.

### Acceptance criteria
- No two courses on `/courses` display the same photo.
- No stock photo is reused in more than one place site-wide (course card, hero, about, gallery all draw from distinct pools).
- `/contact` map embed renders an actual, correct Kathmandu location pin (not blank/placeholder).
- All images lazy-load below the fold, with the hero/logo marked `priority`.

---

## 5. Header — replace separate Login/Register icons with a single Profile/Account icon

### Current behavior
`src/components/layout/Header.tsx:174-191` renders **two separate icon buttons** side-by-side on desktop:
```tsx
<Link href="/student/login">  <Button ...><LogIn /></Button></Link>
<Link href="/student/register"><Button ...><UserPlus /></Button></Link>
```
Plus, in the mobile sheet menu (`Header.tsx:140-151`), both **also** appear as full-width labeled buttons ("Student Login" / "Student Register").

### Why it's a problem
Two icon-only buttons with no visible label are ambiguous (`LogIn` vs `UserPlus` icons are easy to misread at a glance), and they consume header real estate that's already tight now that the logo is larger (§1) and next to an "Enquire Now" CTA, phone number, and hamburger menu. Client explicitly asked for **one profile icon** that leads to both login and signup.

### Fix specification
1. Remove the two separate `LogIn`/`UserPlus` icon buttons from the desktop header (`Header.tsx:174-191`).
2. Add a **single account icon** (`User` or `CircleUserRound` from `lucide-react`) that opens a small dropdown/popover with two options:
   - "Log In" → `/student/login`
   - "Sign Up" → `/student/register`

   Implementation: reuse the existing `DropdownMenu`-style pattern if one exists in `src/components/ui/`, or build a minimal popover using the existing `Sheet`/Radix primitives already in the project (`components/ui/`).

   ```tsx
   <DropdownMenu>
     <DropdownMenuTrigger asChild>
       <Button variant="outline" size="icon" aria-label="Student account">
         <CircleUserRound className="size-5" />
       </Button>
     </DropdownMenuTrigger>
     <DropdownMenuContent align="end">
       <DropdownMenuItem asChild><Link href="/student/login">Log In</Link></DropdownMenuItem>
       <DropdownMenuItem asChild><Link href="/student/register">Sign Up</Link></DropdownMenuItem>
     </DropdownMenuContent>
   </DropdownMenu>
   ```
   If no dropdown-menu primitive exists yet in `src/components/ui/`, add one (Radix `@radix-ui/react-dropdown-menu` is a natural fit given Radix primitives are already used for `Sheet`/`Select`).
3. In the **mobile sheet**, collapse the two full-width buttons into one "Student Login / Sign Up" combined button, or keep both but visually group them under a single "Your Account" sub-heading rather than presenting them as two disconnected primary actions.
4. Keep `isActive()` highlighting logic — the trigger icon should show an active/highlighted state when the user is on `/student/login` or `/student/register`.

### Acceptance criteria
- Desktop header shows exactly **one** account-related icon button (down from two).
- Clicking it reveals both Login and Sign Up as clearly labeled options.
- Mobile menu no longer shows two competing full-width auth buttons with no clear primary action.
- No loss of functionality — both `/student/login` and `/student/register` remain reachable in ≤2 clicks from any page.

---

## 6. Footer — fix and properly structure contact information

### Current behavior (`src/components/layout/Footer.tsx:132-201`)
The footer already has a reasonably good *structure* (address/phone/email/hours), but the underlying data is incomplete/placeholder:
- `instituteInfo.contact.address` = `"Kathmandu, Nepal"` — not a real street address, unusable for actual navigation and weak for **local SEO** (Google favors full, structured NAP — Name/Address/Phone — data).
- `mapEmbed` uses literal `PLACEHOLDER` strings (see §4.3) — currently non-functional.
- Only phone, WhatsApp (same number as phone), and email are present — no secondary contact channel (e.g. a second branch/phone line, if applicable) and social links (`instituteInfo.socials`, `institute.ts`) are unverified placeholder handles (`facebook.com/darbarcomputer`, etc.) that should be confirmed as real, live accounts before launch.
- `SITE_CONFIG.phone` (`lib/constants.ts:8`) and `instituteInfo.contact.phone` (`institute.ts:17`) are two **separate hardcoded copies of the same number** — a maintenance risk (updating one and forgetting the other silently desyncs header, footer, and JSON-LD).

### Why it's a problem
Contact info is the most trust-critical, most frequently referenced content block on the entire site (header click-to-call, footer, contact page, JSON-LD `LocalBusiness` schema for SEO). Placeholder/incomplete data here undermines both user trust and local-search visibility.

### Fix specification
1. **Single source of truth:** consolidate to one contact object. Recommend `instituteInfo.contact` in `src/content/institute.ts` as the canonical source, and have `SITE_CONFIG` in `lib/constants.ts` import from it instead of hardcoding a duplicate phone number.
2. **Get and enter the real, full street address** from the client (building name, street, ward, city, postal area — full NAP format), not just "Kathmandu, Nepal". This same address must be used consistently in: footer, `/contact` page, and the `LocalBusiness` JSON-LD (`src/lib/seo.ts` — verify it pulls from `instituteInfo.contact`).
3. **Fix the map embed** with the real Google Maps embed code for that address (see §4.3).
4. **Verify all social links resolve to real, live DarbarTech accounts** before launch; remove any platform from `instituteInfo.socials` that doesn't have a live/maintained account rather than linking to a dead handle.
5. **Footer layout polish** (minor, while touching this file):
   - The "Call" and "Email" mini-cards (`Footer.tsx:146-179`) are in a `sm:grid-cols-2` layout that's good — keep, but confirm long addresses/emails don't overflow on narrow viewports (`break-all` is already applied to email, good).
   - Add a direct **click-to-WhatsApp** link in the footer contact block (currently WhatsApp only appears as a header icon/social icon) since WhatsApp is a primary contact channel for Nepali audiences.
6. Add explicit **NAP schema markup** consistency check: ensure `app/layout.tsx` → `orgJsonLd`/`buildMetadata` in `src/lib/seo.ts` uses the exact same address/phone strings as the visible footer (search engines flag mismatched NAP data across a page as a trust signal issue).

### Acceptance criteria
- Footer, `/contact` page, and structured data (`view-source` → JSON-LD) all show the **same, complete, real address**.
- Map embed renders a working, correctly-pinned map.
- No hardcoded duplicate phone/email constants remain outside the single `instituteInfo.contact` source.
- All social icons link to verified, live accounts.

---

## 7. Reduce on-page content volume — concise, SEO-friendly copy over walls of text

### Current behavior
Word counts pulled directly from the content source files:

| File | Word count | Notes |
|---|---|---|
| `src/content/courses.ts` | ~5,900 words | 37 courses × long descriptions, skills lists, career-outcome lists |
| `src/content/institute.ts` | ~700 words | About/mission/vision paragraphs are dense, multi-sentence blocks |
| `app/about/page.tsx` | ~615 words | Additional prose on top of the institute content already being reused here |

Additionally:
- `Footer.tsx:127-130` repeats a **long descriptive paragraph** about DarbarTech (course count, fields, positioning) that largely **duplicates** what's already said in the Hero and About page — this is the kind of redundant boilerplate the client is flagging.
- Course `shortDescription` fields (used in `CourseCard.tsx:102`) are `line-clamp-2` in the UI, meaning **much of the written copy per course is invisible on cards anyway** — it's being authored for length, not for what's actually read.
- `src/content/courses.ts` header comment literally flags itself:
  ```
  // [PLACEHOLDER CONTENT - feeNPR values are estimates, replace with real Darbar Computer pricing before launch]
  // [Industry Certification values are illustrative pathway names per source notes — confirm real partnerships before publishing claims]
  ```
  This confirms a chunk of the "extra content" currently on the site is explicitly marked as unverified filler that was never meant to ship as-is.

### Why it's a problem
Long, generic paragraphs:
- Hurt readability/scannability for the actual audience (students, parents, career-switchers skimming on mobile).
- Dilute keyword focus for SEO — search engines and users both reward **specific, structured, unique-per-page content** (course name + skill + outcome) over repeated boilerplate sentences reused across Hero/Footer/About.
- Increase page weight/time-to-scan without adding conversion value.

### Fix specification

**7.1 — Editorial pass on course content (`src/content/courses.ts`):**
- Rewrite each `shortDescription` to **1 concise sentence (≤18 words)** — it's the only description visible on the card anyway (2-line clamp).
- Move longer, SEO-rich detail (skills, tools, outcomes, curriculum) to the **course detail page only** (`app/courses/[slug]`), structured under clear subheadings (`What You'll Learn`, `Tools`, `Careers`) rather than dense paragraphs — this is good for both scannability and for targeting long-tail search queries per course.
- Replace or verify all `[PLACEHOLDER]`-flagged fee/certification data with real, confirmed values before launch — do not ship marked-placeholder claims live.

**7.2 — Trim repeated boilerplate:**
- The long institute-description paragraph in `Footer.tsx:127-130` should be cut to **one short tagline + 1 sentence max** — the footer's job is navigation/contact, not re-selling the brand story a third time on the same page view.
- Cross-check Hero, About page, and Footer for duplicated sentences/claims; each should say something **different** (Hero = hook/value prop, About = full story, Footer = trust-confirming close), not repeat the same "37 courses, 15 fields" line three times verbatim.

**7.3 — SEO-friendly structure over prose volume:**
- Favor **bulleted/structured content** (skills lists, "who this is for", outcome badges — many of which already exist as data fields like `skillsGained`, `careerOpportunities`) over paragraph-form marketing copy. This is both more scannable for users and easier for search engines to parse as distinct, indexable facts.
- Each course detail page (`app/courses/[slug]`) should have a genuinely **unique** meta title/description generated from that course's specific fields (verify `src/lib/seo.ts` does this dynamically rather than a shared template) — unique per-page SEO metadata matters more for search visibility than long visible body copy.
- Apply the same "cut to one clear sentence" edit to the About page's mission/vision blocks — keep the *substance*, cut filler transition sentences.

### Acceptance criteria
- No course card requires scrolling/clamping hidden text — visible copy matches authored length.
- No sentence/claim is repeated verbatim in more than one section of the same page.
- All `[PLACEHOLDER]`-marked content in `courses.ts` is resolved with real, confirmed data before go-live.
- Each course detail page has unique `<title>`/`<meta description>` (spot-check 5 random course pages via view-source).

---

## 8. Course card — fix "Next Batch / Every Week" and button alignment

### Current behavior
`src/components/sections/CourseCard.tsx:123-138` — the card footer:
```tsx
<CardFooter className="pt-2 pb-5 flex items-center justify-between gap-3 border-t border-neutral-100 mt-2">
  <div className="flex flex-col min-w-0 mr-2">
    <span className="text-[11px] ... mb-0.5">Next Batch</span>
    <span className="text-sm font-semibold ... line-clamp-1">{course.newBatch}</span>
  </div>
  <Link href={...} className="shrink-0 group/btn">
    <Button size="sm" className="w-full">{course.cta ?? "View Details"}<ArrowUpRight /></Button>
  </Link>
</CardFooter>
```
Two concrete bugs:
1. `items-center` vertically centers the two-line "Next Batch / Every Week" text block against the **single-line** button. Because the label block is two lines (an 11px uppercase label + a 14px value) and the button is one line, `items-center` causes the button to sit vertically mis-matched relative to the label baseline — it looks visually "floating" rather than baseline-aligned with the batch value text, especially when `course.newBatch` values vary in length ("Every Week" vs "Every Sunday" vs longer strings — verify actual data in `courses.ts`, field `newBatch`).
2. The button `<Button size="sm" className="w-full">` is wrapped in a `shrink-0` link — `w-full` inside a `shrink-0` flex child means the button sizes to its own content via the wrapping `Link`, which is fine, but combined with `justify-between` on the parent, on narrower card widths (2-column tablet layout, `sm:grid-cols-2` in `CoursesClient.tsx:388`) the label text and button crowd each other with inconsistent gap, especially where `newBatch` text is longer and `line-clamp-1` truncates awkwardly mid-word.

### Fix specification
```tsx
<CardFooter className="pt-3 pb-5 flex items-end justify-between gap-3 border-t border-neutral-100 mt-2">
  <div className="flex flex-col min-w-0 flex-1 gap-0.5">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
      Next Batch
    </span>
    <span className="text-sm font-semibold text-neutral-900 truncate">
      {course.newBatch}
    </span>
  </div>
  <Link href={`/courses/${course.slug}`} className="shrink-0">
    <Button size="sm" className="whitespace-nowrap">
      {course.cta ?? "View Details"}
      <ArrowUpRight className="size-3.5 ..." />
    </Button>
  </Link>
</CardFooter>
```
Key changes:
- `items-center` → **`items-end`**: aligns the button to the *bottom* of the label stack, matching the visual baseline of the "Next Batch" value text rather than centering against the whole two-line block. This is the correct fix for a two-line-label + one-line-button footer pattern.
- Give the text block `flex-1` (instead of a fixed `mr-2`) so it consistently takes available space and the button consistently sits flush right with a stable gap, regardless of `newBatch` string length.
- Change `line-clamp-1` → `truncate` (equivalent visual result, more idiomatic Tailwind for single-line ellipsis) and drop the redundant `w-full` on the button (it doesn't need to fill its already `shrink-0` wrapper — this was doing nothing useful and risked stretching).
- Add `whitespace-nowrap` to the button so "View Details" + icon never wraps to two lines on narrow 2-column card widths, which was likely contributing to the reported misalignment.

### Acceptance criteria
- On the 3-column desktop grid, 2-column tablet grid, and 1-column mobile grid, the batch label and the CTA button sit on a consistent shared baseline across every card, regardless of `newBatch` text length.
- No card shows the button vertically offset from the batch-date text.
- Spot-check the course with the longest `newBatch` value in `courses.ts` (grep for `newBatch:` and find the longest string) to confirm truncation behaves correctly rather than pushing the button.

---

## 9. Cross-cutting: SEO-friendly content strategy (ties §4 + §7 together)

Since image cleanup and content trimming are both explicitly framed by the client as **SEO-related**, treat them as one workstream:

1. **Unique `alt` text per image** (see §4.4) — currently formulaic, should be descriptive and course/context-specific.
2. **Unique meta title/description per course page** — verify `src/lib/seo.ts`'s `buildMetadata()` pulls dynamically from each course's own fields rather than a shared template string.
3. **Structured data** — confirm `Course`/`LocalBusiness`/`BreadcrumbList` JSON-LD (already scaffolded per `src/lib/seo.ts`, `orgJsonLd`) reflects the corrected NAP data from §6 and the trimmed content from §7.
4. **Heading hierarchy** — with the counselor CTA section removed (§2) and content trimmed (§7), re-verify each page still has exactly one `<h1>` and a logical `h2`/`h3` structure (course detail pages, About, FAQ).
5. **Avoid duplicate content across pages** — the repeated "37 courses, 15 fields" boilerplate (§7.2) is also an SEO anti-pattern (search engines can treat heavily repeated block content across a domain as low-value boilerplate); trimming it helps both user experience and crawl quality.

---

## 10. Priority & Effort Summary

| # | Item | Priority | Relative Effort | Files primarily touched |
|---|---|---|---|---|
| 1 | Increase logo size (header/footer) | High (quick win) | Small | `DarbarTechLogo.tsx`, `Header.tsx`, `Footer.tsx` |
| 2 | Remove counselor CTA section | High (quick win) | Small | `app/page.tsx`, `CTABanner.tsx` |
| 8 | Fix "Next Batch" / button alignment | High (quick win) | Small | `CourseCard.tsx` |
| 5 | Merge Login/Register into one profile icon | Medium | Medium | `Header.tsx`, new `DropdownMenu` UI primitive |
| 3 | Simplify course category filter into 6 groups | Medium | Medium | `constants.ts`, `CoursesClient.tsx` |
| 6 | Fix footer/contact info (real address, working map) | High (needs client data) | Medium | `institute.ts`, `constants.ts`, `seo.ts` — **blocked on client providing real address** |
| 4 | Unique HD images, no repeats, fix map | High (needs asset sourcing) | Large | `courses.ts`, `institute.ts`, image asset pipeline — **blocked on client providing real photos, or sign-off on stock sourcing** |
| 7 | Trim/rewrite content for SEO conciseness | Medium–High | Large (editorial) | `courses.ts`, `institute.ts`, `about/page.tsx`, `Footer.tsx` |
| 9 | SEO cross-check (metadata, alt text, schema) | Medium | Small–Medium | `seo.ts` + all content files (verification pass) |

**Recommended sequencing:**
1. Ship the three quick wins (#1, #2, #8) immediately — no dependencies, purely code-level.
2. In parallel, request from the client: (a) real full street address + working map pin, (b) real campus/classroom photography or sign-off on curated unique stock, (c) confirmed course fees and certification-partner names to replace `[PLACEHOLDER]` data.
3. Once client assets land, execute #4 and #6 together (both are "real data replacing placeholders").
4. Do the content editorial pass (#7) and category simplification (#3) together, since both involve rewriting `courses.ts`/`constants.ts` — avoid touching the same files twice.
5. Ship #5 (profile icon) and #9 (SEO verification pass) last, as polish/QA.

---

## 11. Open questions for the client (blocking items)

1. Should the "Not sure which course is right for you?" section be removed **only from the homepage**, or from every page it appears on (FAQ, Admissions Inquiry)? *(§2)*
2. Please provide the **real, full street address** of the DarbarTech campus (building/street/ward) for the footer, contact page, and map embed. *(§4, §6)*
3. Can you provide **real classroom/lab/student photos** (with consent) for course cards, hero, and about page — or should we proceed with curated unique stock photography as a placeholder set? *(§4)*
4. Please confirm/correct the **real course fees** and any **actual industry certification partnerships** — several values in the current build are explicitly marked as placeholder/illustrative and should not go live as-is. *(§7)*
5. Please confirm which social media accounts are actually live and should be linked in the footer. *(§6)*

---

*End of document.*
