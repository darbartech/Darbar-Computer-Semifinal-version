# DarbarTech — Brand Color & Design Transformation Guide
**For: Darbar Computer Institute static website**
**Source: `final-logo.png` (icon), `final_small_logo__with_trans.png` (full lockup)**

---

## 1. Logo Analysis

The DarbarTech mark is a **"T + D" monogram**: the letterform reads as a "T" (Tech) built from a horizontal bar and stem, interlocking with a "D" (Darbar) formed as an open, rounded arc. It's rendered with a glossy/beveled 3D finish (soft highlight on the upper-left faces, deeper shade on lower-right), sitting on a transparent background.

Two colors carry the entire identity:

| Element | Role | Sampled Hex | RGB |
|---|---|---|---|
| **T mark** ("Tech") | Lighter, brighter accent | `#15678E` | 21, 103, 142 |
| **D mark** ("Darbar") | Deep, grounded anchor | `#172B48` | 23, 43, 72 |
| Subtitle "GROUP OF TECHNOLOGY" | Neutral label | Mid-gray (approx. `#6B7280`) | 107, 114, 128 |

These were sampled directly from the pixel data of the source PNGs (opaque fill regions), so treat them as the **true brand hex values** — more accurate than what's currently hard-coded in the codebase (see §2).

**Design language of the mark itself:**
- Geometric, squared-off construction (no rounded terminals except the D's arc) → reads as *precise, technical, structured*.
- Two-tone split (cool teal + deep navy) → reads as *trustworthy institution* (navy) with a *modern tech* accent (teal).
- Glossy bevel/3D treatment → gives it a slightly corporate/dimensional feel; the flat website should not try to replicate the bevel, just borrow the two flat colors.

---

## 2. Current vs. Correct Brand Colors

The codebase (`app/globals.css`, `DarbarTechLogo.tsx`) already has a blue/navy system in place, but it's an **approximation** of the real logo, not a pixel-accurate extraction. Here's the gap:

| Token | Currently in code | Extracted from actual logo | Verdict |
|---|---|---|---|
| Primary (teal) | `#0F70A8` | `#15678E` | Close, but code version is brighter/lighter — should be corrected |
| Secondary (navy) | `#163A5E` | `#172B48` | Code version is noticeably lighter/more blue — should be darkened |
| Accent | `#5B8FA8` | — (not in logo; a tint of teal) | Fine to keep as a derived tint |
| Subtitle gray | `#a1a1aa` / `#52525b` (neutral scale) | ~`#6B7280` | Acceptable, minor tune optional |

**Recommendation:** update the two core brand variables to match the logo exactly, then regenerate the tint/shade ramps from those corrected values so every button, badge, and hover state stays in sync with the real logo rather than a guessed color.

---

## 3. Recommended Color System

### 3.1 Core brand colors (corrected)

```css
--color-primary:    #15678E;  /* Teal — "Tech", CTAs, links, active states */
--color-secondary:  #172B48;  /* Navy — "Darbar", headers, footer, dark surfaces */
--color-accent:     #4E8CAE;  /* Mid-tone tint between the two, for accents/badges */
```

### 3.2 Full token set for `app/globals.css`

Replace the existing `--color-primary*`, `--color-secondary*`, `--color-accent*` blocks with:

```css
@theme {
  /* Core brand */
  --color-primary: #15678E;
  --color-primary-foreground: #ffffff;

  --color-secondary: #172B48;
  --color-secondary-foreground: #ffffff;

  --color-accent: #4E8CAE;
  --color-accent-foreground: #ffffff;

  /* Primary (Teal) ramp */
  --color-primary/5:  #EBF2F6;
  --color-primary/10: #D6E5ED;
  --color-primary/20: #ADCBDB;
  --color-primary/30: #85B1C9;
  --color-primary/40: #5C97B7;
  --color-primary/50: #15678E;
  --color-primary/60: #135D80;
  --color-primary/70: #105271;
  --color-primary/80: #0E4763;
  --color-primary/90: #0B3C54;

  /* Secondary (Navy) ramp */
  --color-secondary/5:  #EAECEF;
  --color-secondary/10: #D5D9DF;
  --color-secondary/20: #ABB3BF;
  --color-secondary/30: #818D9F;
  --color-secondary/40: #57677F;
  --color-secondary/50: #172B48;
  --color-secondary/60: #142741;
  --color-secondary/70: #112239;
  --color-secondary/80: #0E1C31;
  --color-secondary/90: #0A1729;

  /* Accent (mid teal-navy) ramp */
  --color-accent/5:  #EEF2F5;
  --color-accent/10: #DCE6EB;
  --color-accent/20: #B9CDD7;
  --color-accent/30: #96B4C3;
  --color-accent/40: #739BAF;
  --color-accent/50: #4E8CAE;
  --color-accent/60: #467E9C;
  --color-accent/70: #3D6F8A;
  --color-accent/80: #336078;
  --color-accent/90: #2A5166;

  --color-ring: #15678E;
}
```

Also update the `:root` fallback block (`--primary`, `--secondary`, `--accent`, `--ring`) with the same three hex values so both the Tailwind `@theme` layer and the plain CSS variables stay in sync.

### 3.3 Supporting neutrals (unchanged, still work well)

Keep the existing neutral gray scale (`--color-neutral-50` → `--color-neutral-900`) — it's a standard, well-balanced scale and doesn't need to change. Use it for body text, borders, and muted backgrounds so the brand teal/navy stay reserved for emphasis.

### 3.4 Status colors (unchanged)

Success `#16a34a`, warning `#d97706`, destructive `#dc2626` are neutral utility colors independent of brand identity — no change needed.

---

## 4. Accessibility Check (WCAG contrast vs. white `#ffffff`)

| Color | Contrast ratio on white | Passes AA (4.5:1 normal text) | Passes AA (3:1 large text/UI) |
|---|---|---|---|
| Primary `#15678E` | **6.25:1** | ✅ Yes | ✅ Yes |
| Secondary `#172B48` | **14.23:1** | ✅ Yes | ✅ Yes |

Both core colors are safe for body text, buttons, and links directly on white. Note: navy text (`#172B48`) on teal (`#15678E`) backgrounds is only **2.28:1** — don't pair navy text on teal buttons; always use white text/foreground on both primary and secondary fills (already reflected in `--color-primary-foreground` / `--color-secondary-foreground: #ffffff` above).

---

## 5. Typography Pairing

The logo's squared, geometric letterforms suggest a **clean grotesque/geometric sans** for headings, paired with a highly legible workhorse sans for body copy. The site already loads **Inter**, which is a good match — keep it, but differentiate weight usage:

| Use | Font | Weight |
|---|---|---|
| H1 / Hero headline | Inter | 700–800 (Bold/Extrabold) |
| H2–H4 | Inter | 600–700 (Semibold/Bold) |
| Body copy | Inter | 400 (Regular) |
| Buttons / labels / badges | Inter | 600 (Semibold), slightly letter-spaced (`tracking-wide`) for small caps like "GROUP OF TECHNOLOGY" |
| Nav / eyebrow text | Inter | 500, uppercase, `tracking-widest`, gray-500 — mirrors the logo's subtitle treatment |

No new font import needed.

---

## 6. Design Direction: "Structured Trust"

Translating the mark's personality (precise geometry + navy authority + teal energy) into UI decisions:

1. **Navy carries weight, teal carries action.**
   Use `--color-secondary` (navy) for the header background, footer, dark hero sections, and headline text. Reserve `--color-primary` (teal) almost exclusively for interactive elements: primary buttons, links, active nav states, form focus rings, icons that need to pop.

2. **Sharp, geometric structure over soft/organic shapes.**
   The logo has almost no curves except the D's arc. Favor:
   - Squared or lightly-rounded cards (`--radius-md` / `--radius-lg`, avoid full pill radii except on true buttons/badges).
   - Straight dividers and grid-pattern backgrounds (the codebase already has `.grid-pattern` — lean into it more, e.g. in the hero and stats strip).
   - A single accent "cut corner" or angled divider between sections, echoing the diagonal cut in the T mark's top-right corner, as a recurring signature shape.

3. **Two-tone gradients, not multi-color gradients.**
   The `.gradient-primary` and `.gradient-text-primary` utilities already blend secondary→primary — this is exactly the logo's own teal-to-navy relationship. Keep gradients strictly within this navy→teal axis (never introduce a third hue like purple or green into gradients) to stay on-brand.

4. **Subtitle/eyebrow micro-label pattern.**
   The logo pairs a bold wordmark with a small, tracked-out, gray subtitle line flanked by thin rules ("— GROUP OF TECHNOLOGY —"). Reuse this exact pattern site-wide for section eyebrows (e.g. "— OUR COURSES —", "— WHY CHOOSE US —") to reinforce brand recall beyond just the header logo.

5. **White space as a third "color."**
   Because the mark reads clearly only on a plain background, keep hero and section backgrounds mostly white/neutral-50, using navy and teal as deliberate blocks (buttons, banners, footer) rather than as ambient tints everywhere.

---

## 7. Component-Level Recommendations

| Component | Treatment |
|---|---|
| **Header** | White or `neutral-50` background, logo at left using corrected colors, nav links in `neutral-700`, active/hover link in `primary`. Sticky with a subtle bottom border (`--color-border`) or 1px shadow on scroll. |
| **Hero** | `secondary` (navy) background or navy gradient (`.gradient-primary`), white headline, teal (`primary`) CTA button, light `grid-pattern` overlay at low opacity for texture. |
| **Buttons (primary)** | Fill `primary` `#15678E`, white text, hover state `--color-primary/60` (`#135D80`), focus ring `--color-ring`. |
| **Buttons (secondary/outline)** | Border `secondary`, text `secondary`, hover fill `secondary/5`. |
| **Cards (courses, testimonials)** | White surface, `border` neutral-200, hover: border shifts to `primary/30` + subtle shadow lift — ties interactivity back to brand teal. |
| **Badges/tags** | Small pill using `accent/10` background with `accent` or `secondary` text — good for course levels, categories. |
| **Footer** | `secondary` (navy) or `secondary/90` background, logo in light/"dark" variant (already supported by `DarbarTechLogo` `variant="dark"` prop), links in neutral-300, hover teal. |
| **Section eyebrows/dividers** | Thin horizontal rule + uppercase tracked label in `neutral-500`, exactly mirroring the logo's "GROUP OF TECHNOLOGY" subtitle styling. |
| **Icons** | Line icons colored `primary` on light backgrounds, white on navy backgrounds — never a third color. |

---

## 8. Logo Usage Guidelines

- **Minimum clear space:** keep space around the mark equal to the height of the "T" bar on all sides — don't let text or UI elements crowd it.
- **On light backgrounds:** use the standard two-tone version (`variant="light"` in `DarbarTechLogo.tsx`) — navy "Darbar" + teal "Tech."
- **On dark/navy backgrounds** (footer, dark hero): use the light/inverted variant — white "Darbar" + teal "Tech," which the component already supports via `variant="dark"`.
- **Never**: recolor the mark itself in a third hue, stretch it non-proportionally, add drop shadows beyond the source file's built-in bevel, or place it on busy photographic backgrounds without a solid-color safe zone behind it.
- **Icon-only version** (`final-logo.png`) is for favicons, app icons, and tight spaces (mobile nav collapsed state); the full lockup (`final_small_logo__with_trans.png`) is for header/footer and marketing use where width allows.

---

## 9. Action Items for Implementation

1. In `app/globals.css`, replace `--color-primary`, `--color-secondary`, `--color-accent` and their `/5`–`/90` ramps with the corrected values in §3.2 (both in the `@theme` block and the `:root` fallback block).
2. In `src/components/common/DarbarTechLogo.tsx`, update the inline SVG `fill` colors (`colors.t`, `colors.d`) to `#15678E` and `#172B48` respectively so the coded logo matches the real PNG exactly.
3. Replace any favicon/app-icon assets with the `final-logo.png` icon mark.
4. Audit existing components for hardcoded hex values (search for `#0F70A8`, `#163A5E`, `#5B8FA8`) and swap them for the CSS variables so future color updates only need to happen in one place.
5. Introduce the eyebrow/subtitle micro-label pattern (§6, point 4) across `SectionHeading.tsx` if not already present, for consistent brand voice.
