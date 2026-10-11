# DarbarTech Website — Design Transformation Plan

A scoped, low-risk plan to fix button consistency and trim redundant
content, without a full redesign.

---

## Principle

**Every clickable button-shaped element routes through
`src/components/ui/button.tsx`.** No new one-off button styles. If a
section needs a look the current variants don't support, extend
`buttonVariants` — don't hand-roll a new element.

---

## 1. Fix the Hero (highest priority)

**"Explore Courses"**
- Replace the custom `<Link>` with `<Button asChild size="lg"><Link href="/courses">…</Link></Button>` (or `variant="default"` if not using `asChild`).
- Drop the custom navy gradient + shimmer sweep. If a hero-specific
  emphasis is wanted, add a `hero` variant to `buttonVariants` instead
  of styling inline — keeps it in the system and reusable later.
- Result: `rounded-2xl`, `h-12`, consistent with every other primary CTA
  on the site.

**"Book a Free Consultation"**
- Convert to `<Button variant="outline" size="lg">` with the
  `MessageCircle` icon, matching the icon-button pattern already used
  elsewhere (see `Header.tsx`'s icon buttons).
- Keep the "5-min call · No pressure" microcopy as a small caption
  *below* the button rather than baked into a custom two-line label —
  simpler markup, same reassurance.

## 2. Fix CTABanner

- Remove the inline `bg-secondary` override — just use
  `<Button size="lg" variant="secondary">`. If the current visual
  (white/light button on the gradient banner) is preferred, that's
  what `variant="outline"` with a light-on-dark treatment is for; add
  an `outline-inverse` variant if needed rather than overriding again.
- Convert the "Call ..." link to `<Button variant="outline" size="lg">`.

## 3. WhatsApp button

- Keep WhatsApp green — it's an expected, recognizable affordance for
  that specific channel, not really "brand" color.
- Simplify: the expandable popover card (desktop) duplicates what the
  floating bubble already communicates. Consider dropping the popover
  and keeping just the bubble + tooltip on hover, reducing custom CSS
  and one more "mini button system" (its card has its own `Button`
  override too).

## 4. Standardize radius & height globally

Add this as a one-line rule in the repo (e.g. in a `CONTRIBUTING.md` or
at the top of `button.tsx`):

> All buttons use `rounded-xl` (sm) or `rounded-2xl` (default/lg).
> Heights: `sm=40px`, `default=44px`, `lg=48px`. No exceptions without
> adding a variant.

## 5. Trim redundant homepage content

- **Merge StatsStrip into WhyChooseUs**, or cut StatsStrip down to a
  thin single-row strip directly under the Hero (numbers only, no
  cards) so it reads as a quick trust signal rather than a full second
  "why us" section right before the actual Why Choose Us section.
- **Simplify the Hero background.** Reduce `COLUMN_COUNT`/`TOKENS_PER_COLUMN`
  substantially (e.g. from 22×6=132 tokens to ~40) or remove the falling
  code-rain layer entirely and keep only the perimeter language icons.
  This cuts animation overhead and lets the headline + popups breathe.

## 6. Suggested homepage order (post-trim)

1. Hero (simplified CTA + lighter background)
2. Thin stats row
3. Course categories
4. Course grid
5. Why Choose Us (absorbs stats detail)
6. How It Works
7. Events
8. Testimonials
9. FAQ
10. CTA Banner

Same content, ~1 fewer full section, clearer trust-signal flow.

---

## 7. Effort estimate

| Task | Effort |
|---|---|
| Hero CTA → `Button` component | Small |
| CTABanner cleanup | Small |
| WhatsApp popover simplification | Small–Medium |
| Add radius/height rule + optional new variants | Small |
| Merge/trim Stats + Why Choose Us | Medium |
| Reduce hero background density | Small |

Total: a focused half-day to a day of implementation, no architectural
changes required — this is a consistency and pruning pass, not a
rebuild.

---

*See `01-design-audit.md` for the full findings behind this plan.*
