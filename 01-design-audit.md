# DarbarTech Website — Design Audit

**Scope:** `darbar-computer-site.zip` (Next.js 15 / React / Tailwind)
**Focus:** Button system consistency, visual noise, content bloat

---

## 1. Summary

The codebase is technically solid — a proper `Button` component exists at
`src/components/ui/button.tsx` with clean `cva`-based variants
(`default`, `secondary`, `outline`, `ghost`, `link`, `destructive`) and
consistent sizing (`h-11` default, `rounded-xl`/`rounded-2xl`).

The problem isn't the component. It's that **several high-visibility
sections don't use it.** They hand-roll their own `<Link>`/`<a>` elements
styled to *look* like buttons, each with a different radius, height,
color, and animation. The result is a homepage that shows 4+ distinct
"button languages" before a visitor even finishes scrolling.

---

## 2. The Button System, as designed

`src/components/ui/button.tsx`

| Variant | Style |
|---|---|
| `default` | `bg-primary` (#15678E), `rounded-2xl`, `h-11` |
| `secondary` | `bg-secondary` (#172B48), `rounded-2xl` |
| `outline` | white bg, neutral border, primary on hover |
| `ghost` | transparent, neutral hover |
| `link` | text-only, underline on hover |

Sizes: `sm` (h-10), `default` (h-11), `lg` (h-12), plus icon variants.

This is a good, minimal system. **Used correctly in:** `Header.tsx`,
`CourseCard.tsx`, homepage Events section, `FAQAccordion` CTA link.

---

## 3. Where it breaks down

### 3.1 Hero — two custom buttons, neither uses `Button`
`src/components/sections/Hero.tsx`

- **"Explore Courses"** — hand-coded `<Link>`:
  `rounded-lg` (not `rounded-xl`/`2xl`), custom navy gradient
  (`from-[#172B48] to-[#222F5D]`), a custom shimmer-sweep animation on
  hover, `h-11 sm:h-12`. None of this maps to the `default` or
  `secondary` variant it should be.
- **"Book a Free Consultation"** — not a button shape at all: a circular
  icon badge + two lines of stacked text. A third distinct pattern,
  introduced in the very first section of the page.

This is the highest-traffic real estate on the site, and it's the least
consistent with the rest of the system.

### 3.2 CTABanner — overrides instead of using variants
`src/components/sections/CTABanner.tsx`

- Uses `<Button size="lg">` but then overrides its background with
  `bg-secondary hover:bg-secondary/90` inline — this is exactly what
  `variant="secondary"` already does. The override adds risk of drift
  without adding anything.
- The secondary action ("Call ...") is, again, a raw `<a>` styled as a
  button rather than `<Button variant="outline">`.

### 3.3 WhatsApp floating button — a fourth brand color
`src/components/common/WhatsAppButton.tsx`

- Introduces WhatsApp green (`#25D366` / `#128C7E`) as a de facto fourth
  brand color, with its own popover card, its own gradient header, and
  its own `Button` override (`bg-[#25D366]`).
- Reasonable as a WhatsApp affordance (green is expected there), but
  it's one more visual language layered on top of navy/primary/teal.

### 3.4 Net result — radius and height inconsistency

| Location | Radius | Height |
|---|---|---|
| Design-system `Button` | `rounded-xl` / `rounded-2xl` | 40 / 44 / 48px |
| Hero primary CTA | `rounded-lg` | 44 / 48px |
| Hero secondary CTA | `rounded-full` icon + no box | n/a |
| CTABanner secondary | `rounded-xl` | 48px |
| WhatsApp bubble | `rounded-full` | 48 / 56px |

Four different corner-radius values for "clickable button-shaped thing"
on one page.

---

## 4. Content-density issues

The homepage stacks **10 full sections** in sequence:

`Hero → StatsStrip → CategoryDirectory → CourseGrid → WhyChooseUs →
HowItWorks → Events → TestimonialCarousel → FAQAccordion → CTABanner`

Two of these are largely redundant:

- **StatsStrip** and **WhyChooseUs** both exist to build trust
  ("certified trainers," "real projects," "small batches"), just in
  different card shapes (numbers-first vs. icon-cards). A first-time
  visitor sees the same 3–4 claims twice within one scroll.
- **Hero background** (`buildRain()` in `Hero.tsx`) generates 132
  animated falling code tokens + 10 floating language icons purely as
  ambient decoration, competing for attention with the 3 floating popup
  images already layered on the hero photo. It's a lot of custom motion
  code for a background that mostly adds noise behind the headline.

---

## 5. Root cause

None of this is a "bad design" problem in isolation — every individual
section looks deliberate and polished. The issue is **governance**: new
sections were built by styling raw elements to *approximate* the button
system instead of importing and extending `Button`. Once that starts,
each new section invents its own slightly-different variant, and the
drift compounds.

---

*See `02-transformation-plan.md` for the proposed fix.*
