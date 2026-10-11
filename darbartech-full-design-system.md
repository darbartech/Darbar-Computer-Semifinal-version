# DarbarTech Full Design System
**A complete component, typography, imagery, and iconography spec for a smoother, more professional, modern site.**
Companion to `darbartech-brand-design-transformation.md` (color source-of-truth) — this document turns those colors into concrete rules for every UI part of the actual codebase.

---

## 0. Design Principles (the 5 rules everything below follows)

1. **One accent color at a time.** Teal (`primary`) is the *only* color allowed to signal "click me" (buttons, links, active nav, focus rings). Navy (`secondary`) is *structural* (headers, footers, dark sections). Never let both compete for attention in the same component.
2. **Consistent elevation, not decoration.** Depth comes from a restrained shadow scale + hover lift, not borders-on-borders or drop shadows on drop shadows. Max one visible "raise" effect per element.
3. **Generous, even spacing.** Modern = breathing room. Increase whitespace before adding new visual elements to fill a gap.
4. **Motion is a whisper, not a shout.** 150–300ms ease transitions only, on hover/focus states. No bouncy/spring effects, no auto-playing animation loops except a subtle marquee/carousel if already present.
5. **Real photography over stock-collage.** Replace the current AI-collage hero background treatment (see §6) with fewer, higher-quality, purposeful images.

---

## 1. Typography System

Keep **Inter** (already loaded) but apply a stricter modular scale so headings feel intentional rather than ad-hoc `text-2xl sm:text-3xl lg:text-4xl` strings scattered per component.

### 1.1 Type scale (add to `globals.css` as utility classes or Tailwind config)

| Token | Size / Line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 3rem–3.75rem / 1.1 (`text-5xl` → `text-6xl`) | 800 (Extrabold) | `-0.02em` | Hero H1 only |
| `h1` | 2.25rem / 1.15 (`text-4xl`) | 700 | `-0.02em` | Page titles |
| `h2` | 1.875rem–2.25rem / 1.2 (`text-3xl`→`4xl`) | 700 | `-0.01em` | Section headings |
| `h3` | 1.25rem / 1.3 (`text-xl`) | 600 | normal | Card titles, subsections |
| `h4` | 1.125rem / 1.4 (`text-lg`) | 600 | normal | Minor headings |
| `body-lg` | 1.125rem / 1.7 (`text-lg`) | 400 | normal | Lead paragraphs |
| `body` | 1rem / 1.65 (`text-base`) | 400 | normal | Default copy |
| `body-sm` | 0.875rem / 1.6 (`text-sm`) | 400 | normal | Secondary/meta copy |
| `caption` | 0.75rem / 1.4 (`text-xs`) | 500–600 | `0.05em`, uppercase | Eyebrows, labels, badges |

**Rule:** never mix more than 3 heading sizes on a single page. On the homepage that means: `display` (hero) → `h2` (section headings) → `h3` (card titles). Everything else is body text.

### 1.2 Color pairing for text

| Text role | Color | Notes |
|---|---|---|
| Primary heading on white | `neutral-900` | Not pure black — softer, more premium |
| Body copy on white | `neutral-600` | Current usage is already correct — keep |
| Muted/meta text | `neutral-500` | Timestamps, counts, helper text |
| Heading on navy/dark bg | `white` | 100% opacity for H-tags |
| Body on navy/dark bg | `neutral-300` or `white/80` | Never full white for paragraph text — reduces glare, feels more refined |
| Link/interactive text | `primary` (`#15678E`), hover `primary/70` | |
| Eyebrow/label text | `primary` on light sections, `neutral-300`/`accent` on dark sections | Already implemented in `SectionHeading.tsx` — extend to all sections consistently |

### 1.3 Line-length & rhythm

- Body paragraphs: cap width at `max-w-2xl` (already used in Hero) — never let body text run wider than ~65–75 characters.
- Section vertical rhythm: keep the existing `.section-padding` utility (4rem → 5rem) but add a smaller `--section-gap: 1.5rem` variable for spacing *between* stacked elements inside a section (badge → heading → description) so it isn't hand-tuned per component (`mb-6`, `mt-4`, `mt-2` inconsistently, as currently in `Hero.tsx`).

---

## 2. Buttons

Current `buttonVariants` (CVA in `button.tsx`) is solid — refine sizing and states for a more premium feel:

### 2.1 Updated variant styling

```ts
variant: {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md active:bg-primary/80",
  secondary:
    "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 hover:shadow-md",
  outline:
    "border border-neutral-300 bg-white text-neutral-800 hover:border-primary hover:text-primary hover:bg-primary/5",
  ghost:
    "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
  link:
    "text-primary underline-offset-4 hover:underline p-0 h-auto",
  destructive:
    "bg-destructive text-white hover:bg-destructive/90",
}
```

Key changes from current code:
- Default/primary now gets a **visible shadow that deepens on hover** (`shadow-sm` → `hover:shadow-md`) instead of only a flat color darken — this is what makes buttons feel "clickable" and modern rather than flat.
- Outline button switches from a muted gray hover to a **primary-tinted hover** (`hover:border-primary hover:text-primary`) so every interactive element consistently previews teal on hover.
- Standardize all button heights to a **44px (`h-11`) minimum on `lg`/CTA buttons** for comfortable tap targets (current `lg` is only `h-9` — too small for a primary CTA button on a marketing site, especially mobile).

### 2.2 Sizing (revised)

| Size | Height | Padding | Use |
|---|---|---|---|
| `sm` | h-9 (36px) | px-3.5 | Card actions ("View Details") |
| `default` | h-10 (40px) | px-5 | Standard buttons |
| `lg` | h-12 (48px) | px-7 | Hero CTAs, CTABanner, form submits |
| `icon` | 40×40px | — | Icon-only (menu, close) |

### 2.3 Micro-interaction

- Add `active:translate-y-px` (already present) — keep, it's a nice tactile touch.
- Add `transition-all duration-200 ease-out` uniformly (currently `transition-all` with no explicit duration — browser default is fine but being explicit keeps consistency across all interactive components).
- Icon buttons (arrow, chevron) should shift **4px in the direction of travel** on hover, exactly as already done in `CourseCard.tsx`'s `ArrowUpRight` — this pattern should be applied to **every** "→" button/link site-wide (CTABanner, Footer "View all courses," nav links) for consistency.

---

## 3. Cards

Current `Card` component (`rounded-xl border-neutral-200 shadow-sm hover:shadow-md`) is a good base. Elevate it:

### 3.1 Base card

```
rounded-2xl border border-neutral-200 bg-white shadow-sm
transition-all duration-300
hover:shadow-lg hover:-translate-y-1 hover:border-primary/20
```

- `rounded-xl` → `rounded-2xl` (16px) reads more modern/soft-premium without becoming bubbly.
- Add `hover:-translate-y-1` (a subtle lift) — currently only `StatsStrip` cards have this; extend it to `CourseCard`, testimonial cards, and blog cards for a unified "everything responds" feel.
- Add `hover:border-primary/20` so the border itself tints teal on hover, reinforcing brand color as the universal "interactive" signal (§0 rule 1).

### 3.2 CourseCard specifics

- Image aspect ratio `16/10` is good — keep.
- The `group-hover:scale-105` image zoom + `bg-gradient-to-t from-black/40` hover overlay is a nice modern touch — keep both.
- **Add a subtle top accent bar** on hover: a 3px `bg-primary` strip that slides in at the top of the card (`scale-x-0 group-hover:scale-x-100`, transform-origin left) — a small signature detail that ties every card interaction back to the brand teal without adding color noise when idle.
- Price + CTA footer: keep the current layout (price left, button right) — it's a proven, scannable pattern for course-catalog cards.

### 3.3 Stat cards (`StatsStrip.tsx`)

Already well designed (icon chip → number → label, with icon-chip color inversion on hover). Keep as-is; just apply the corrected primary color (§ brand doc) and increase the icon chip to `rounded-2xl` to match the new card radius standard.

---

## 4. Forms & Inputs

Current `Input` component is clean. Refinements for a more polished, modern feel:

```
h-11 rounded-lg border border-neutral-300 bg-white px-3.5 text-sm
shadow-xs transition-colors
placeholder:text-neutral-400
focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10
disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-50
```

Changes vs. current:
- `h-9` → `h-11`: matches the friendlier, larger touch-target sizing used on modern SaaS/education sites (form-heavy pages like Admissions Inquiry benefit most).
- Focus ring changed from `ring-3 ring-ring/50` (fairly strong blue halo) to a **softer, wider `ring-4 ring-primary/10`** paired with a solid `border-primary` — this is the current "modern form" convention (soft glow + crisp border) rather than a thick colored outline.
- Add `shadow-xs` at rest so inputs read as tactile 3D fields, not just flat-bordered boxes.

**Labels:** use `text-sm font-medium text-neutral-800 mb-1.5` consistently (verify `Label` component matches — apply if not).

**Validation states:** error border `border-destructive` + helper text `text-xs text-destructive mt-1`; success (e.g., "Email available") `border-success` + `text-success`.

---

## 5. Iconography

The site uses `lucide-react` throughout — this is a good, modern, consistent icon set. Rules to tighten it up:

| Context | Size | Color (default state) | Color (active/hover) |
|---|---|---|---|
| Inline with body text (contact info, meta rows) | `size-4` (16px) | `neutral-400` or `primary` (as currently in `CourseCard`) | — |
| Feature/benefit icon chips (WhyChooseUs, Stats) | `size-6` inside a `size-12`–`size-14` rounded chip | `primary` on `primary/10` bg | Inverts: `white` on `primary` bg |
| Button icons | `size-4`–`size-5` | Inherits button text color | — |
| Social icons (footer) | `size-4` inside a `size-9` bordered circle | `neutral-400` | `white` on `primary` fill |
| Decorative section dividers | thin `1px` line, not icon | `primary/40` | — (already used correctly in `SectionHeading`) |

**Consistency fix:** standardize every icon "chip" (the colored rounded square/circle behind an icon) to the same corner radius as cards (`rounded-2xl` for larger chips ≥48px, `rounded-full` only for avatar-style circles like social icons). Currently `StatsStrip` uses `rounded-xl` — bump to `rounded-2xl` to match §3.1.

**Never** mix icon sets (no Font Awesome/Heroicons mixed with Lucide) — Lucide only, site-wide.

---

## 6. Imagery

This is the highest-impact "professional vs. amateur" lever on the site. Current Hero uses 5 separate AI-generated stock-style images (a low-opacity background collage + 4 floating rotated thumbnail cards). Recommendations:

### 6.1 Reduce visual noise in the Hero

- **Cut the background collage entirely**, or reduce it to a single, subtle, brand-tinted texture (the existing `.grid-pattern` dot-grid already does this job better and looks more "tech/institute" than a faint blurry photo collage).
- **Keep at most 2 floating photo cards**, not 4, and increase their size/quality bar rather than scattering many small tilted thumbnails — 4 competing rotated images with different shadow-color tints (`shadow-primary/10`, `shadow-secondary/10`, `shadow-accent/10`) reads as busy/templated. Two well-cropped, real (or consistent-style) photos with a single shared shadow treatment feel far more premium.
- Standardize floating-card treatment: `rounded-xl border border-white shadow-lg` (drop the per-card colored shadow variation and per-card opacity variation — use one consistent `shadow-lg` + one consistent `opacity-90` across all of them).

### 6.2 Photography style guide

| Rule | Detail |
|---|---|
| Consistent color grade | Every photo should sit comfortably next to the navy/teal palette — slightly cool white balance, avoid warm-orange stock photos that clash with the brand blues |
| Consistent crop ratio | Course cards: `16:10`. Hero/feature photos: `4:3` or `3:2`. Testimonials/avatars: `1:1` circular |
| Real over generic | Prioritize real classroom/lab/graduate photos over generic stock/AI images wherever available — authenticity matters more for a local institute's trust signals than polish |
| Overlay convention | Any text-over-image treatment always uses the same overlay: `bg-gradient-to-t from-black/50 via-black/10 to-transparent` — don't invent a new gradient per component |
| Placeholder/fallback | Course images without a real photo should fall back to a **branded placeholder**: navy background + centered white/teal course-category icon — not a broken image icon or blank gray box (`CourseCard.tsx`'s current `onError` just hides the image; replace with a styled fallback div) |

### 6.3 Logo image usage in layout

- Header: full lockup (`DarbarTechLogo` `size="md"`, `variant="light"`) — current implementation is correct, just needs the corrected hex values from the brand doc.
- Footer: full lockup, `variant="dark"`, `size="lg"` — already correct in `Footer.tsx`.
- Favicon/OG image/app icon: use the icon-only mark (`final-logo.png`) — verify `app/layout.tsx` metadata references a properly exported icon set (16×16, 32×32, 180×180 apple-touch, and a 1200×630 OG social-share image using the full lockup centered on a navy background).

---

## 7. Layout & Structural Components

### 7.1 Header

Current: sticky, `bg-white/80 backdrop-blur-md`, border-bottom. This is already a modern pattern — refinements:
- Add a subtle `shadow-sm` that only appears after scroll (via a scroll listener toggling a class), so the header feels "flat/merged" at the top of the page and "elevated" once content scrolls beneath it — a common polish detail on modern sites.
- Active nav-link indicator: currently a solid `bg-primary/5` pill. Upgrade to a **thin animated underline** (2px `bg-primary` bar sliding in beneath the active/hovered link) in addition to the color change — feels more contemporary than a filled pill for a top nav.

### 7.2 Footer

Current dark (`neutral-950`) footer with a top `gradient-primary` accent bar is strong — keep the structure. Refinements:
- Swap literal `neutral-950` for `secondary/90` or a navy-based dark (`#0E1C31`, i.e., `--color-secondary/80`) so the footer's darkness is **brand navy**, not a generic near-black — reinforces the logo relationship (D = navy = the footer's own tone) rather than using an unrelated neutral gray-black.
- Social icons: match §5 spec (bordered circle → primary fill on hover) — current implementation is close, just verify final hex.

### 7.3 Section backgrounds — alternating rhythm

To avoid a flat, monotonous scroll, alternate section backgrounds in this fixed sequence down the homepage:

1. Hero — white + grid-pattern texture
2. Stats — `neutral-50` (current, keep)
3. Courses — white
4. Why Choose Us — `neutral-50` or a very light `primary/5` tint
5. How It Works — white
6. Testimonials — `secondary` (navy) full-bleed section for contrast and visual "anchor" partway down the page
7. FAQ — white
8. CTA Banner — `gradient-primary` (current, keep)
9. Footer — navy (§7.2)

This gives the page 2 "dark anchor" moments (Testimonials + CTA + Footer) instead of one, breaking up what's currently a long white/light-gray scroll and making the navy brand color feel intentional rather than only living in the header logo and buttons.

---

## 8. Motion & Interaction Summary

| Element | Transition | Duration |
|---|---|---|
| Buttons | color, shadow, `translate-y` | 150–200ms ease-out |
| Cards | shadow, `translate-y`, border-color | 250–300ms ease-out |
| Nav links | color, underline `scale-x` | 200ms ease |
| Accordion (FAQ) | `max-height`, opacity | 300ms ease-out (already correct in `accordion.tsx`) |
| Image zoom (course card) | `scale` | 500ms ease (already correct) |
| Page-load reveal (optional) | `opacity` + `translate-y-2→0` on scroll-into-view for section headings | 400ms, staggered 80ms per child |

Keep all durations in this narrow band — nothing under 150ms (feels jarring/glitchy) or over 500ms (feels sluggish).

---

## 9. Consolidated Checklist

- [ ] Apply corrected brand hex values (`#15678E` / `#172B48`) across `globals.css` and `DarbarTechLogo.tsx` (see companion brand doc, §9)
- [ ] Update `buttonVariants` per §2.1–2.3 (shadows, hover states, `lg` height → 48px)
- [ ] Bump card radius to `rounded-2xl` and add lift + border-tint hover across `Card`, `CourseCard`, stat cards
- [ ] Update `Input`/form fields to `h-11`, softer focus ring, `shadow-xs`
- [ ] Standardize icon-chip radius to `rounded-2xl`, enforce Lucide-only icon usage
- [ ] Simplify Hero imagery: remove/replace background collage, cut floating photos from 4 → 2, unify shadow/opacity treatment
- [ ] Add styled branded fallback for missing course images (replace silent `onError` hide)
- [ ] Add scroll-triggered header shadow + animated underline for active nav link
- [ ] Recolor footer from `neutral-950` to brand-navy-based dark
- [ ] Apply the alternating section-background rhythm (§7.3) to the homepage
- [ ] Audit all `transition-*` usage for consistent duration values per §8
