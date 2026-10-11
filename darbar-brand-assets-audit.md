# DarbarTech Group of Technology — Visual Asset Audit & Recommendations
**Prepared as:** Brand/Design audit of `darbar-computer-site.zip`
**Date:** July 28, 2026
**Scope:** Every icon, image, and visual asset referenced in the codebase — what's missing, what's wrong/unrelated, and exactly what to replace it with.

---

## 1. Executive Summary

The codebase (Next.js + TypeScript) is well-built and the content is real and specific — but **not a single production-ready image asset actually exists in the project.** Every visual either:

1. **Doesn't exist at all** (favicon, app icons, OG/social image, logo files) — the folders are literally empty (`public/images/logo`, `/team`, `/courses`, `/gallery`), or
2. **Is unrelated boilerplate** left over from `create-next-app` (Vercel/Next.js default SVGs), or
3. **Is a placeholder that will break or embarrass the brand** — the hero image is hot-linked from a random Webflow template CDN with no connection to DarbarTech, and all "team," "campus," course, and gallery photos are either duplicated stock IDs or calls to an AI text-to-image placeholder API (`coresg-normal.trae.ai`) that is explicitly marked `isPlaceholder: true` in the code and will not resolve in production.

Good news: the **logo itself is solid** — it's a coded, scalable SVG component (`DarbarTechLogo.tsx`), not an image file, so the brand mark doesn't need to be "found," just exported into real icon files.

Below is the full inventory, organized by asset type, with specific, licensed, ready-to-use replacement sources for each.

---

## 2. Quick-Reference Audit Table

| # | Asset | Current State | Problem | Priority |
|---|-------|---------------|---------|----------|
| 1 | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Present | Unrelated `create-next-app` boilerplate — Vercel/Next.js logos with zero relevance to a Kathmandu computer institute | 🔴 Delete immediately |
| 2 | Favicon / browser tab icon | **Missing entirely** | No `favicon.ico`, `icon.png`, or `app/icon.tsx` anywhere in the project | 🔴 Critical |
| 3 | Apple touch icon / Android/PWA icons | **Missing entirely** | No manifest, no touch icons | 🔴 Critical |
| 4 | Open Graph / social share image | **Missing** — referenced at `ogImage: "/opengraph-image.png"` in `src/lib/constants.ts` but the file doesn't exist | Broken link previews on WhatsApp, Facebook, Messenger — all primary channels for a Nepali local business | 🔴 Critical |
| 5 | Static logo exports (PNG/SVG for email signatures, print, WhatsApp Business, favicons) | **Missing** — logo only exists as a live React/SVG component | Can't be used outside the website | 🟠 High |
| 6 | Hero image (`Hero.tsx`) | Hot-linked to `cdn.prod.website-files.com/.../hero-image.png` | Unrelated Webflow template stock asset, not brand-owned, could vanish or change anytime (external hotlink), not Nepal/DarbarTech-relevant | 🔴 Critical |
| 7 | About/campus image (`ABOUT_CAMPUS_IMAGE` in `institute.ts`) | Calls an AI image-generation placeholder endpoint | Will not render in production (not a real hosted image); also — AI-faked "campus" building is a trust/authenticity risk once launched | 🔴 Critical |
| 8 | Team photos (4 staff, `institute.ts`) | Calls the same AI placeholder endpoint, explicitly flagged `isPlaceholder: true` | Fake AI headshots for real named roles (Director, trainers) is a credibility and potential-deception risk | 🔴 Critical |
| 9 | Course category images (37 courses / 15 categories, `courses.ts`) | Pexels hot-links | **Photo ID `6424590` is reused for 6 different categories** (programming, AI, data, cloud, video, cyber, marketing) — visually identical thumbnails across unrelated courses | 🟠 High |
| 10 | Gallery images (`institute.ts` gallery + `gallery.ts`) | Pexels hot-links | Same photos reused 2–3× across different captions ("Open house event" and "Networking practice" use the identical image) | 🟠 High |
| 11 | Testimonials | Empty array, explicitly commented as placeholder needing real names/photos + consent | No photos to source yet — needs a process decision, not stock images | 🟡 Medium |
| 12 | `public/images/logo`, `/team`, `/courses`, `/gallery` folders | Empty | Structure exists, nothing in it | 🟠 High |

---

## 3. Detailed Recommendations by Asset

### 3.1 🔴 Delete: Leftover Next.js boilerplate
`public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

These are the default icons every `create-next-app` project ships with. They aren't referenced by the DarbarTech components (nothing in `src/` imports them) — they're just dead weight and, if they ever surface anywhere, actively confusing since one is literally the Vercel logo. **Action: delete the five files.** No replacement needed.

### 3.2 🔴 Favicon, App Icons & Manifest
**Nothing exists today.** Since the brand mark is already a coded SVG (`DarbarTechLogo.tsx` — the blue "monitor + swoosh" icon), the fastest, most on-brand path is to **export that exact SVG**, not source a new icon from the internet:

1. Isolate just the icon `<svg viewBox="0 0 100 100">...</svg>` portion (lines 36–58 of `DarbarTechLogo.tsx`), on a solid brand-navy (`#172B48`) or white background, as a standalone square file.
2. Run it through **[realfavicongenerator.net](https://realfavicongenerator.net/)** or **[favicon.io/svg-favicon](https://favicon.io/svg-favicon/)** (both free, no signup) to generate the full set:
   - `favicon.ico` (16×16, 32×32, 48×48 multi-size)
   - `icon-192.png`, `icon-512.png` (Android/PWA)
   - `apple-touch-icon.png` (180×180)
   - `site.webmanifest`
3. Drop the output into `/public` (or `src/app/` as `icon.png`/`apple-icon.png` if using the Next.js App Router metadata convention) and reference in `layout.tsx`/`metadata`.

**Colors to use:** `#15678E` (Tech blue) / `#172B48` (Darbar navy) — pulled straight from the existing `DarbarTechLogo.tsx` palette, so the favicon matches the header logo exactly.

### 3.3 🔴 Open Graph / Social Share Image
`src/lib/constants.ts` already expects a file at `/opengraph-image.png` — it just doesn't exist. Given this is a Nepali local business where **WhatsApp and Facebook link sharing are the primary discovery channel**, this is high priority.

**Spec:** 1200×630px, PNG or JPG, under 300KB.
**Recommended content:** Build this as a simple branded graphic rather than sourcing a stock photo — navy (`#172B48`) background, the DarbarTechLogo mark + wordmark centered/left-aligned, tagline "GROUP OF TECHNOLOGY," and a short value line ("37 Courses · 15 Career Fields · Kathmandu"). Use **Figma** or **Canva** (both have free 1200×630 OG-image templates) — this should be an in-house design pass, not a stock photo, since it's the first brand impression in a chat/link preview.

### 3.4 🟠 Static Logo Exports
The React component is great for the live site but there's no logo file for:
- Email signatures / letterhead
- WhatsApp Business profile photo
- Printed materials, banners, ID cards
- The favicon source (3.2 above)

**Action:** Export the SVG in `DarbarTechLogo.tsx` (both `light` and `dark` variants shown in the component) to standalone files:
- `logo-full-light.svg` / `logo-full-dark.svg` (icon + wordmark)
- `logo-icon-only.svg` (just the monitor mark, square, for social profile photos — 400×400px PNG export too)
- Save into the already-existing but empty `public/images/logo/` folder.

No internet sourcing needed here — this is a straightforward export task from existing code.

### 3.5 🔴 Hero Image
**Current:** `https://cdn.prod.website-files.com/640021754b75fb0c4b535941/64539e138771820ebcb7619d_hero-image.png` — this is a generic asset from an unrelated Webflow-built template/site, hot-linked from someone else's CDN. It has no connection to computer training, Nepal, or DarbarTech, and hot-linking a third party's CDN is both a licensing risk and a reliability risk (it can 404 without warning).

**Recommendation:** Replace with a real photograph (or illustration) that actually depicts the brand promise ("less lecture, more lab" — hands-on computer training). Two good directions:

- **Photography route (preferred for authenticity):** Source from **Unsplash** or **Pexels** — both are free for commercial use, no attribution required. Search terms: `"computer lab students Asia"`, `"coding bootcamp classroom"`, `"students learning computer Kathmandu"` on:
  - https://unsplash.com/s/photos/computer-lab-students
  - https://www.pexels.com/search/students%20computer%20lab/
- **Illustration route (safer, more "brand," avoids any "stock photo of strangers" mismatch with real testimonials later):** Use a South-Asian-inclusive illustration set like **[unDraw](https://undraw.co/illustrations)** (free, customizable to brand color `#15678E`) or **[Humaaans](https://www.humaaans.com/)** for a mix-and-match hero illustration of people at computers.

Given the site already leans on real Pexels photography everywhere else (courses, gallery), **staying consistent with real photography for the hero** (not illustration) is the better call — just replace the Webflow link with a properly licensed, brand-relevant Pexels/Unsplash photo, ideally later replaced with the institute's own photography once available.

### 3.6 🔴 About / Campus Exterior Image
**Current:** `ABOUT_CAMPUS_IMAGE` in `institute.ts` calls `coresg-normal.trae.ai/api/ide/v1/text_to_image` — an AI image-generation API endpoint used as a placeholder. This will not resolve to a stable image in production, and even if it did, **presenting an AI-generated building as your actual campus is a real authenticity/trust issue** for a business people will physically visit.

**Recommendation:**
- **Best option:** Replace with an actual photo of the real DarbarTech building/entrance (a quick phone photo, shot well in daylight, beats any stock or AI image for a local institute — prospective students want to see the real place).
- **Interim option** (until real photography exists): Use a generic, honestly-captioned "training center" exterior/interior shot from Pexels/Unsplash (search: `"modern office building entrance"` or `"education center exterior Asia"`) — but this should be clearly temporary, not shipped to a live "About Us" page implying it's their building.

### 3.7 🔴 Team Photos (4 staff members)
**Current:** All 4 team entries (Director, Programming Trainer, Design Trainer, Hardware/Networking Trainer) call the same AI text-to-image placeholder, and are explicitly flagged `isPlaceholder: true` in the source. These are named, real roles at a real institute — shipping AI-generated "photos" of them is a trust and honesty problem, not just a technical one.

**Recommendation, in priority order:**
1. **Best:** Real headshots of the real staff. This is a content/ops task, not a sourcing task — schedule a quick phone-camera headshot session (good window light, plain background) for the actual Director and trainers named in the code.
2. **If real photos aren't ready at launch:** Don't fake it with stock photos of random people pretending to be "the Director" either — that's a bigger problem than an AI photo. Instead, use a **neutral placeholder avatar** (initials on a brand-navy circle, or a simple line-art person icon) with a "Meet the team — photos coming soon" note, until real photos are in hand. Icon set: **[Feather Icons](https://feathericons.com/)** or the `lucide-react` package **already installed in this project** (`User` / `UserCircle` icon) — zero new dependency needed.

### 3.8 🟠 Course Category Images (37 courses, 15 categories)
**Current:** `courses.ts` maps each category to a Pexels photo ID via a lookup function — but **6 of the 15 categories (Programming, AI, Data, Cloud, Video Editing, Cybersecurity, Digital Marketing) all point to the identical photo** (`pexels-photo-6424590`). Career and Diploma also share one image; Business/Career/Design partially overlap too. On a course grid, this reads as a bug, not a design choice.

**Recommendation:** Source one distinct, categorically accurate photo per category from Pexels or Unsplash (both free, commercial-use, no attribution). Suggested search terms per category — keep the same `1000px`-wide, compressed JPG convention already used:

| Category | Suggested search term (Pexels/Unsplash) |
|---|---|
| Basic Computer | `"beginner computer class"` / `"senior learning computer"` |
| MS Office / Office Skills | `"office worker typing documents"` |
| Programming | `"programmer writing code screen"` |
| Web Development | `"web developer html css screen"` |
| AI / AI Engineering | `"artificial intelligence machine learning code"` |
| Data (Analytics/Science) | `"data analyst dashboard charts"` |
| Cloud Computing | `"cloud computing server data center"` |
| Graphic Design | `"graphic designer working tablet"` |
| Video Editing | `"video editor timeline software"` |
| Business (Office/Admin) | `"business professional meeting laptop"` |
| Networking | `"network engineer server rack cables"` |
| Cybersecurity | `"cybersecurity lock code screen"` |
| Digital Marketing | `"social media marketing analytics phone"` |
| Career Prep | `"job interview resume"` |
| Diploma / Certification | `"graduation certificate ceremony"` |

Pull each from https://www.pexels.com/search/ or https://unsplash.com/s/photos/ using these terms, keeping consistent aspect ratio (landscape, ~4:3) and similar color grading (avoid mixing very warm and very cool photos in one grid) for visual consistency.

### 3.9 🟠 Gallery Images (`institute.ts` gallery array + `gallery.ts`)
**Current:** 9–13 gallery entries share only ~7 unique photos between them — e.g., the same photo is captioned both "Open house event" (g7) and "Networking practice" (g8); "Trainer with students" and "Group photo with certificates" also share one image. A photo gallery with visibly duplicated images undercuts the "see our real campus" purpose of the section.

**Recommendation:** Source distinct images for the four gallery categories already defined (`Classroom`, `Lab`, `Events`, `Certificates`) — aim for 2–3 unique photos per category, minimum 8 unique files total:
- **Classroom:** `"students classroom computer training"` (Pexels/Unsplash)
- **Lab:** `"computer lab desktop monitors row"`, `"hardware lab repair students"`
- **Events:** `"certificate ceremony graduation event"`, `"open house presentation audience"`
- **Certificates:** `"student receiving certificate handshake"`

As with the campus photo, **this section is the strongest candidate for real, institute-owned photography** — a gallery is meant to prove the place is real; genuinely, a handful of smartphone photos from an actual class session will build more trust than any stock photo once available.

### 3.10 🟡 Testimonials
Currently an empty array with an explicit code comment: *"do not publish without real student names/photos and their consent."* This is correctly handled in code — **no image sourcing needed here.** When real testimonials come in, use real student photos with signed consent, not stock photos of unrelated people claiming to be named students (that would be actively deceptive, distinct from a generic "team headshot coming soon" placeholder).

---

## 4. Folder & Naming Plan

Map replacements into the existing (currently empty) structure:

```
public/images/
├── logo/
│   ├── logo-full-light.svg
│   ├── logo-full-dark.svg
│   └── logo-icon-512.png
├── hero/
│   └── hero-classroom.jpg
├── about/
│   └── campus-exterior.jpg
├── team/
│   ├── director.jpg
│   ├── trainer-programming.jpg
│   ├── trainer-design.jpg
│   └── trainer-networking.jpg
├── courses/
│   ├── basic.jpg  ├── office.jpg   ├── programming.jpg  ├── web.jpg
│   ├── ai.jpg      ├── data.jpg     ├── cloud.jpg         ├── design.jpg
│   ├── video.jpg    ├── business.jpg ├── network.jpg       ├── cyber.jpg
│   ├── marketing.jpg├── career.jpg   └── diploma.jpg
└── gallery/
    ├── classroom-1.jpg, classroom-2.jpg
    ├── lab-1.jpg, lab-2.jpg
    ├── events-1.jpg, events-2.jpg
    └── certificates-1.jpg, certificates-2.jpg

public/
├── favicon.ico
├── icon-192.png
├── icon-512.png
├── apple-touch-icon.png
├── site.webmanifest
└── opengraph-image.png
```

## 5. Priority Checklist

1. 🔴 Delete `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`
2. 🔴 Generate favicon + app icon set from `DarbarTechLogo.tsx` via realfavicongenerator.net
3. 🔴 Design and add `opengraph-image.png` (1200×630)
4. 🔴 Replace `Hero.tsx`'s Webflow-hotlinked image with a licensed, relevant photo
5. 🔴 Replace `ABOUT_CAMPUS_IMAGE` — real photo strongly preferred over any stock/AI placeholder
6. 🔴 Replace 4 team AI-placeholder portraits with real photos or neutral avatar icons
7. 🟠 Source 15 distinct course-category images (fixing the 6-way `6424590` duplication)
8. 🟠 Source 8+ distinct gallery images across the 4 categories
9. 🟠 Export static logo files into `public/images/logo/`

## 6. Licensing Note
Pexels and Unsplash images are both free for commercial use and require no attribution — safe to use directly for a commercial site. If any AI-generated imagery is used as an interim measure anywhere (e.g., placeholder team avatars), it should be clearly avoided for anything implying a real, named, verifiable person or place (team photos, campus building) — those categories should hold for real photography rather than shipping a synthetic stand-in.
