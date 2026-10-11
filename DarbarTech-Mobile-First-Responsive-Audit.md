# DarbarTech Website — Mobile-First Responsive Design Audit
**Prepared as a senior UI/UX design review** · Next.js 15 (App Router) + Tailwind CSS v4
**Scope:** Full codebase review of `app/`, `src/components/`, `src/content/` — Header, Hero, Course Grid/Cards, Course Detail, Courses Filter, Testimonials, Footer, Gallery, Contact, Forms, WhatsApp widget.

---

## 1. Executive Summary

The codebase is **already built on decent responsive foundations** — Tailwind v4 with a real `@theme`, a `container-page` utility, 44px+ tap targets on nav/buttons, `sizes` attributes on most `next/image` calls, and a working slide-out mobile nav (`Sheet`). This is not a rebuild; it's a **refinement and systemization pass**.

That said, the responsiveness was clearly built **breakpoint-by-breakpoint on a per-component basis**, not from a single mobile-first system. That shows up as:

- **Real bugs**: duplicate/conflicting Tailwind breakpoint classes that silently do nothing (dead CSS), a JS-based mobile detection that fights the CSS breakpoints, and a sticky-offset magic number that will drift out of sync with the header.
- **Inconsistency**: spacing, radius, and type scales are hand-tuned per component instead of drawn from a shared scale, so density and rhythm vary page to page.
- **Missed mobile-specific UX**: redundant WhatsApp entry points, cramped tab labels at narrow widths, non-fluid embedded map, no bottom-sheet/native patterns for filters on mobile.

None of this is severe — there's no broken layout, horizontal scroll bug, or unusable page. This document gives you a prioritized, file-level punch list plus the mobile-first system to prevent this class of issue going forward.

---

## 2. What's Already Working Well (keep doing this)

| Pattern | Where | Why it's good |
|---|---|---|
| 44×44px minimum tap targets on interactive elements | `Header.tsx`, mobile nav sheet | Meets WCAG 2.5.5 / Apple HIG touch target guidance |
| `Sheet`-based slide-in mobile nav instead of a dropdown | `Header.tsx` | Standard, thumb-reachable mobile pattern |
| Responsive `sizes` prop on `next/image` | `Hero.tsx`, `CourseCard.tsx` | Prevents over-fetching large images on mobile |
| Base font bumped to 16px on inputs, then relaxed at `md:` | `globals.css` | **Correctly prevents iOS Safari auto-zoom on input focus** — a detail most teams miss |
| `text-balance` / `text-pretty` on headings & body | Hero, section headings | Better line-wrap quality at narrow widths |
| Mobile-only WhatsApp icon collapses to icon-only, hides label until `xl:` | `Header.tsx` | Correctly triages CTA priority as space shrinks |
| Stat grids default to `grid-cols-2` on mobile instead of stacking to 1 | `Hero.tsx`, `CoursesClient.tsx` | Avoids excessive scroll for short numeric content |

---

## 3. Confirmed Issues (file-level, with fixes)

### P0 — Bugs that produce wrong or flaky behavior

**3.1 — Dead/conflicting responsive classes in `Hero.tsx`**
Several elements have two classes for the *same* breakpoint, which is invalid Tailwind usage — only the class that appears later in the generated stylesheet wins, regardless of which one you "meant," so the layout is one CSS build away from silently changing.

```
text-[34px] sm:text-4xl sm:text-[44px] lg:text-[62px] xl:text-[68px]   // two sm: rules
-left-2 sm:-left-4 sm:-left-6 top-[12%] sm:top-16 sm:top-20            // two sm: rules, and lg:top-16 sm:top-20 mismatch
w-[190px] sm:w-[220px] sm:w-[260px]                                     // two sm: rules
-right-2 sm:-right-4 sm:-right-6 bottom-[22%] sm:bottom-24 sm:bottom-28 // two sm: rules
```
**Fix:** collapse each to one rule per breakpoint and add the missing `lg:`/`xl:` step, e.g.:
`text-[34px] sm:text-[44px] lg:text-[62px] xl:text-[68px]`
`top-[12%] sm:top-[16%] lg:top-20`
This is a 15-minute cleanup but it's the difference between an intentional fluid scale and accidental behavior.

**3.2 — JS-based breakpoint detection fights the CSS breakpoint in `TestimonialCarousel.tsx`**
```tsx
const [isMobile, setIsMobile] = React.useState(false); // wrong on first paint for mobile users
React.useEffect(() => {
  const onResize = () => setIsMobile(window.innerWidth < 768);
  ...
}, []);
```
- `isMobile` defaults to `false`, so on first render (and during SSR) a mobile visitor briefly gets the desktop 3-up carousel math before the effect fires — a visible layout flash/CLS on slower devices.
- It duplicates Tailwind's `md:` breakpoint (768px) in JavaScript instead of using CSS, so a future change to the design system's breakpoint won't be reflected here.
- No resize debounce — every pixel of a window resize/rotation re-renders the carousel and restarts the `translateX` transform.

**Fix:** drive `perView` with a CSS-only approach (three absolutely-positioned/`hidden md:flex` track variants, or a `useMediaQuery` hook that reads `matchMedia` and is debounced), or accept the JS approach but initialize from `window.innerWidth` inside a lazy `useState` initializer guarded by `typeof window !== 'undefined'` to remove the flash.

**3.3 — Sticky filter bar offset is a hardcoded magic number in `CoursesClient.tsx`**
```tsx
<div className="sticky top-[73px] z-20 ...">
```
The header is `h-14` (56px) on mobile and `sm:h-16` (64px) at `sm:` and up, plus a 1px border. `73px` doesn't match either state — it's a value that was eyeballed once and will drift the next time the header's height changes, leaving either a visible gap or the filter bar sliding under the header.

**Fix:** expose the header height as a CSS variable set once (e.g. `--header-h: 56px` / `sm:--header-h: 64px`) or measure it with `ResizeObserver` in a shared layout context, then reference `top-[var(--header-h)]` everywhere that needs to stick below the header. This also future-proofs the WhatsApp button and any other sticky element.

### P1 — Real mobile UX friction

**3.4 — Redundant WhatsApp entry points on mobile**
`Header.tsx` shows a WhatsApp icon button (`sm:hidden`) in the top bar, **and** `WhatsAppButton.tsx` is a global fixed bottom-right bubble rendered on every page via `layout.tsx`. On mobile, a user sees two different ways to start the same WhatsApp chat within the first screen. The floating bubble is also `z-50`, fixed `bottom-5 right-5`, and can sit over the last card's "View Details" button or the sticky filter bar's rightmost control on short viewports.
**Fix:** pick one primary channel per surface — keep the header icon for immediate/quick access and either remove the floating bubble on pages that already surface WhatsApp prominently (e.g., course cards, header), or delay/shrink the floating bubble specifically on mobile and give it a safe-area-aware offset (see 4.5 below).

**3.5 — Course detail tabs are cramped at narrow widths**
`app/courses/[slug]/page.tsx`:
```tsx
<TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
  <TabsTrigger value="skills">Skills &amp; Tools</TabsTrigger>
  <TabsTrigger value="portfolio">Portfolio &amp; Career</TabsTrigger>
  <TabsTrigger value="fees">Fees &amp; Batches</TabsTrigger>
```
Below `sm:` (< 640px), four multi-word labels are forced into a 2×2 grid. On a 360px-wide device (the most common Android width in Nepal) `"Portfolio & Career"` and `"Skills & Tools"` will wrap to two lines or truncate, making tab targets uneven in height and harder to tap precisely.
**Fix:** below `sm:`, switch to a horizontally scrollable single row (`flex overflow-x-auto no-scrollbar gap-2`) with `snap-x` — this is the standard mobile tab pattern (see iOS Settings, Android Material tabs) and reads better than a cramped grid.

**3.6 — Non-fluid Google Maps embed**
`src/content/institute.ts`:
```html
<iframe ... width="100%" height="400" ...>
```
Fixed `height="400"` means on a 375px-wide phone the map occupies more vertical scroll real-estate proportionally than on desktop, pushing the rest of the contact page (form, hours) further down. `width` is fluid but `height` isn't, so aspect ratio isn't preserved.
**Fix:** wrap in an aspect-ratio container (`aspect-[4/3] sm:aspect-[16/9]`) and drop the inline `height="400"`, letting the iframe fill via `className="h-full w-full"`.

### P2 — Consistency / polish

**3.7 — Duplicate class typos elsewhere follow the same pattern as 3.1**
Search surfaced the same "two classes at one breakpoint" pattern in a few more places, e.g. `TestimonialCarousel.tsx`'s `mb-8 sm:mb-10 sm:mb-12` and `p-5 sm:p-6 sm:p-7`. These aren't visually broken (later class wins predictably within a single build), but they read as unintentional and make the spacing scale unpredictable to whoever edits next.
**Fix:** run a project-wide regex check (`\bsm:[a-z-]+\s+sm:[a-z-]+\b`, repeat for `md:`/`lg:`/`xl:`) as part of cleanup — see Section 7 checklist.

**3.8 — No shared spacing/typography scale**
Section padding, gap sizes, and heading sizes are defined ad hoc per component (`gap-3 sm:gap-4 sm:gap-6`, `text-xl sm:text-2xl sm:text-3xl`, etc.) rather than pulled from a small number of named steps. This isn't a bug, but it's why density feels slightly different across Hero vs. CourseGrid vs. Footer. See Section 5 for the proposed scale.

---

## 4. Mobile-First Design System Recommendations

Treat this as the reference to design *from* on future pages/components, not just a retrofit.

### 4.1 Breakpoint philosophy
Keep Tailwind's defaults (they already match the codebase) and design in this order — **base styles are the smallest viewport, not desktop-minus-something**:

| Token | Width | Primary use in this site |
|---|---|---|
| *(base)* | 0–639px | Single-column, stacked CTAs, 2-col stat grids only |
| `sm:` | ≥640px | Large phones landscape / small tablets — start allowing 2-up cards |
| `md:` | ≥768px | Tablet — introduce inline nav elements (phone number, filters) |
| `lg:` | ≥1024px | Desktop — 3-up grids, sidebar layouts, sticky asides |
| `xl:` | ≥1280px | Wide desktop — reveal secondary text (e.g. phone number label) |

**Rule going forward:** never write a class list where the same breakpoint prefix appears twice (Section 3.1/3.7). If you need three visual states for one property, use three breakpoints, not two `sm:` values.

### 4.2 Layout patterns by page type
- **Marketing/landing sections** (Hero, WhyChooseUs, StatsStrip, CTABanner): 1 column → `sm:` 2 columns for stat pairs → `lg:` full multi-column layout. Already mostly followed — keep it.
- **Card grids** (Courses, Gallery, Blog): 1 col → `sm:grid-cols-2` → `lg:grid-cols-3`. Already correct in `CourseGrid.tsx`; replicate exactly for Gallery and Blog listing if they diverge.
- **Detail pages with sidebar** (Course detail, potentially future Event detail): stack the sidebar **below** the main content on mobile (`order-2` on the aside, or just DOM order), switch to `lg:grid-cols-3` with `lg:sticky lg:top-[var(--header-h)]` only at `lg:` — sticky asides on a stacked mobile layout do nothing but add JS overhead.
- **Filter/search UIs** (`CoursesClient.tsx`): on mobile, filters belong in a bottom sheet or full-screen modal triggered by a "Filters" button with an active-count badge — not squeezed into a sticky bar. This is already half-implemented (`md:hidden` reveal of a "Filters" button) — finish the mobile sheet version instead of relying on the sticky bar for both breakpoints.

### 4.3 Typography scale (replace ad hoc `sm: sm:` stacking)
Define once, reuse everywhere:

| Role | Mobile | `sm:` | `lg:` |
|---|---|---|---|
| H1 (hero) | 34px / 1.1 | 44px / 1.06 | 62–68px / 1.02 |
| H2 (section) | 26px | 32px | 40px |
| H3 (card/subsection) | 20px | 22px | 24px |
| Body | 15px | 16px | 16px |
| Caption/meta | 12px | 13px | 13px |

Codify these as Tailwind `@theme` custom font-size tokens (e.g. `--text-hero`, `--text-h2`) so every heading pulls from the same three-step scale instead of being hand-tuned per component.

### 4.4 Spacing rhythm
Standardize section vertical rhythm on the existing `.section-padding` utility (`64px` mobile → `80px` at `md:`) and stop overriding it ad hoc. For internal gaps, adopt a 4-step scale: `gap-3` (12px, tight lists) → `gap-4` (16px, related items) → `gap-6` (24px, card grids) → `gap-8`/`gap-10` (32–40px, major section blocks). Audit components for one-off values like `gap-2.5`/`gap-3.5` and consolidate where they aren't load-bearing.

### 4.5 Touch & safe-area handling
- Maintain the existing 44px minimum, but also add **8px minimum spacing between adjacent tap targets** (currently fine on nav/buttons, worth checking on the icon-only social row in the footer, which is tight at `gap-2`).
- Add `env(safe-area-inset-bottom)` padding to the floating `WhatsAppButton` and any future sticky bottom bar, so it clears the home-indicator area on iPhones with notches:
  ```css
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  ```
- Avoid hover-only affordances for anything actionable — everything currently critical (buttons, links) already works on tap; keep new components to the same standard.

### 4.6 Images & performance on mobile networks
- Continue supplying `sizes` on every `next/image` — a couple of avatar/testimonial images render `fill` without a matching `sizes` prop (double-check `TestimonialCarousel.tsx`'s avatar image, currently correct at `44px`, but re-verify any new avatar-style images added later).
- Given the target audience (students in Nepal, meaningful share on 3G/4G and data-capped plans), consider `loading="lazy"` (default in `next/image`) plus explicit `quality={70-75}` for decorative/background imagery, and confirm the Pexels URLs used are requesting an appropriately small `w=` parameter for mobile (`Hero.tsx`'s student avatar images already request `w=100` — good; the hero background photo requests `w=1200` for all breakpoints — consider a smaller `w=` at the `(max-width: 640px)` branch via `next/image`'s automatic srcset, which it already generates correctly from the `sizes` prop, so this is lower priority).

### 4.7 Forms on mobile
- `input,select,textarea,button { font-size: 16px }` below `md:` is already correctly preventing iOS zoom-on-focus — do not regress this.
- Verify `AdmissionInquiryForm.tsx` and `ContactForm.tsx` field groups stack to single-column below `sm:` (spot-checked: they do), and that `select`/`Tabs` components used in the admission form don't rely on hover states for option visibility.
- Ensure autofill-friendly `autocomplete` attributes and `inputmode="tel"`/`inputmode="email"` are present on phone/email fields so mobile keyboards show the right layout — worth a quick grep across both forms.

---

## 5. Prioritized Action Plan

| # | Item | File(s) | Effort | Priority |
|---|---|---|---|---|
| 1 | Fix duplicate/conflicting breakpoint classes | `Hero.tsx` | S | **P0** |
| 2 | Remove JS/CSS breakpoint mismatch, guard first-paint flash | `TestimonialCarousel.tsx` | M | **P0** |
| 3 | Replace magic-number sticky offset with a shared header-height variable | `CoursesClient.tsx`, `Header.tsx` | M | **P0** |
| 4 | Convert course-detail tabs to horizontal scroll below `sm:` | `app/courses/[slug]/page.tsx` | S | P1 |
| 5 | Resolve redundant WhatsApp entry points / add safe-area padding to floating button | `Header.tsx`, `WhatsAppButton.tsx` | S | P1 |
| 6 | Make Google Maps embed aspect-ratio fluid | `institute.ts`, contact page markup | S | P1 |
| 7 | Finish mobile "Filters" bottom-sheet instead of squeezed sticky bar | `CoursesClient.tsx` | M | P1 |
| 8 | Sweep for remaining duplicate-breakpoint classes | project-wide | S | P2 |
| 9 | Codify typography/spacing tokens in `@theme` | `globals.css` | M | P2 |
| 10 | Verify `inputmode`/`autocomplete` on all form fields | `ContactForm.tsx`, `AdmissionInquiryForm.tsx` | S | P2 |

**Effort key:** S = under half a day, M = half–1 day.

---

## 6. Suggested Testing Matrix

Test each P0/P1 fix against:
- **Viewport widths:** 360px (common Android), 390px (iPhone), 768px (iPad portrait), 1024px (iPad landscape / small laptop), 1440px.
- **Real devices if available:** one mid-range Android (Chrome), one iPhone (Safari) — Safari-specific issues (100vh, input zoom, safe-area) won't reliably show in desktop dev tools.
- **Throttled network:** Chrome DevTools "Fast 3G" for the homepage and course-detail page, since hero imagery and the testimonial carousel are the heaviest sections.
- **Orientation change:** rotate on the course listing page (sticky filter bar + resize-driven carousel are the two components most likely to misbehave on rotation).

---

## 7. Quick Cleanup Checklist (can be done immediately, low risk)

- [ ] Search project for repeated breakpoint prefixes in one `className` (`sm:.* sm:`, `md:.* md:`, `lg:.* lg:`) and collapse each to one rule per breakpoint.
- [ ] Replace `sticky top-[73px]` with a CSS variable derived from actual header height.
- [ ] Add `aspect-[4/3] sm:aspect-video` wrapper around the Maps iframe; remove fixed `height="400"`.
- [ ] Guard `isMobile` initial state in `TestimonialCarousel.tsx` against SSR/first-paint mismatch.
- [ ] Convert `TabsList` on course detail to `flex overflow-x-auto` below `sm:`.
- [ ] Add `env(safe-area-inset-bottom)` to `WhatsAppButton.tsx` fixed positioning.
- [ ] Decide on single vs. dual WhatsApp entry point for mobile and remove/adjust the redundant one.

---

*This audit reflects a static code review, not a live device test pass — Section 6's testing matrix should be run against the fixes before shipping to confirm real-device behavior, particularly for the Safari-specific safe-area and input-zoom items.*
