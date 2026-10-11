# DarbarTech — HD Image Sourcing & Implementation Guide
**Real, free-to-use, hotlinkable photo URLs mapped to every image slot in the actual codebase, plus the exact code changes needed to wire them in.**

All images below are sourced from **Pexels** and **Unsplash** — both offer free, high-resolution photography that's free for commercial use with no attribution required (license details in §5). Every URL was verified against the live source page at the time of writing.

---

## 1. How the URLs work (read this first)

Both Pexels and Unsplash serve images through an image CDN that accepts resizing parameters directly in the URL — so you don't need to download anything, you can hotlink and control size/quality on the fly.

**Pexels pattern:**
```
https://images.pexels.com/photos/{PHOTO_ID}/pexels-photo-{PHOTO_ID}.jpeg?auto=compress&cs=tinysrgb&w={WIDTH}
```

**Unsplash pattern:**
```
https://images.unsplash.com/photo-{PHOTO_ID}?auto=format&fit=crop&w={WIDTH}&q=80
```

Adjust `w=` (and add `&h=` + `&fit=crop` for a fixed aspect ratio) per placement — exact recommended values are given per image below.

---

## 2. Required setup: allow the new image domains

`next.config.ts` currently only allowlists the placeholder AI-image domain. Add Pexels and Unsplash before using any URL below, or Next.js's `<Image>` component will throw an error.

```ts
// next.config.ts
images: {
  formats: ["image/avif", "image/webp"],
  remotePatterns: [
    {
      protocol: "https",
      hostname: "coresg-normal.trae.ai",
      port: "",
      pathname: "/api/ide/v1/text_to_image**",
    },
    {
      protocol: "https",
      hostname: "images.pexels.com",
    },
    {
      protocol: "https",
      hostname: "images.unsplash.com",
    },
  ],
},
```

---

## 3. Hero Section (`src/components/sections/Hero.tsx`)

Replace the current AI-generated placeholder collage (5 separate `text_to_image` calls) with these real photos. Per the design-system doc's recommendation, use only **2 floating cards**, not 4, plus one main background — this list gives you the 2 best options and 2 backups.

| Slot | Image | URL (ready to paste) | Notes |
|---|---|---|---|
| Background wash (behind hero, low opacity) | Diverse students collaborating around a laptop, university setting | `https://images.unsplash.com/photo-1758270705290-62b6294dd044?auto=format&fit=crop&w=1920&q=75` | Use at `opacity-[0.07]` exactly as current code does — this replaces the `text_to_image` collage prompt |
| Floating card 1 (top-left) | Close-up hands coding on laptop, JS/web dev | `https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg?auto=compress&cs=tinysrgb&w=800` | 4:3 crop |
| Floating card 2 (top-right) | Graphic designer using stylus/tablet, creative workspace | `https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=800` | 4:3 crop |
| Floating card 3 (bottom-left, optional if keeping 4) | Student holding graduation diploma, smiling | `https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg?auto=compress&cs=tinysrgb&w=800` | 4:3 crop |
| Floating card 4 (bottom-right, optional if keeping 4) | Technician working hands-on with hardware/networking equipment | `https://images.pexels.com/photos/442154/pexels-photo-442154.jpeg?auto=compress&cs=tinysrgb&w=800` | 4:3 crop |

### Implementation

```tsx
// src/components/sections/Hero.tsx — background wash
<Image
  src="https://images.unsplash.com/photo-1758270705290-62b6294dd044?auto=format&fit=crop&w=1920&q=75"
  alt=""
  fill
  priority
  className="object-cover opacity-[0.08] sm:opacity-[0.07]"
  aria-hidden="true"
/>
```

```tsx
// Floating card 1
<div className="absolute left-4 top-24 w-44 h-32 rounded-xl overflow-hidden shadow-lg border border-white opacity-90">
  <Image
    src="https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg?auto=compress&cs=tinysrgb&w=800"
    alt=""
    fill
    className="object-cover"
    aria-hidden="true"
  />
</div>
```

Repeat the same pattern for card 2 with the graphic-design URL. (Per the design-system doc §6.1, drop the per-card colored shadow/opacity variation — use one consistent `shadow-lg border-white opacity-90` treatment across all cards, as shown above.)

---

## 4. Course Category Images (`src/content/courses.ts`)

The course catalog spans many categories. Below is real-photo coverage for the highest-traffic categories (the ones featured in the footer and homepage). Use these as the `image` field for matching courses, and as a **fallback-by-category** pattern for courses not explicitly listed (i.e., every "Web Development" course can share the Web Development image if it doesn't have a unique one yet).

| Category | Course(s) | Image URL | Crop |
|---|---|---|---|
| **Basic Computer** | Digital Literacy Essentials, Speed Typing Mastery, Professional Computer Operator | `https://images.pexels.com/photos/10638075/pexels-photo-10638075.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Office & Productivity** | Microsoft Office Professional, Advanced Excel, AI Office Administration | `https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Programming** | Software Development Foundation, DSA & Competitive Programming, Python for AI | `https://images.pexels.com/photos/6424590/pexels-photo-6424590.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Web Development** | Modern Frontend Engineering, Backend Engineering, MERN Full Stack, Next.js & WordPress, Mobile App Dev | `https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Graphic Design** | Creative Graphic Design Masterclass, Brand Identity & Packaging, UI/UX Design Pro | `https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Business & Accounting** | Professional Accounting Package | `https://images.pexels.com/photos/8296990/pexels-photo-8296990.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Networking** | Network Engineering with CCNA | `https://images.pexels.com/photos/442154/pexels-photo-442154.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |
| **Career Programs / Professional Diploma** | Freelancing & Online Earning, Professional Computer Diploma | `https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg?auto=compress&cs=tinysrgb&w=1000` | 16:10 |

**For the remaining categories** (AI & Automation, Data Science, Cloud & DevOps, Video Production, Cyber Security, Digital Marketing) — these are more abstract/screen-based subjects that photograph less distinctly. Recommended approach: reuse the **Programming** image (`6424590`) as a safe generic "tech/code" placeholder for AI, Data Science, and Cloud & DevOps categories until you have real classroom photos, and search Pexels directly for `"cyber security lock screen"`, `"social media marketing laptop"`, and `"video editing timeline screen"` when ready — these are narrow enough queries to return strong single-source results quickly.

### Implementation pattern (`CourseCard.tsx` already expects `course.image`)

```ts
// src/content/courses.ts
{
  slug: "modern-frontend-engineering",
  title: "Modern Frontend Engineering",
  category: "Web Development",
  image: "https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg?auto=compress&cs=tinysrgb&w=1000",
  // ...rest of fields
}
```

### Branded fallback for any course still missing a photo

Per the design-system doc (§6.2), don't leave `CourseCard.tsx`'s current silent `onError` hide in place. Replace it with a styled fallback:

```tsx
// CourseCard.tsx — replace the onError handler
<Image
  src={course.image}
  alt={`${course.title} - DarbarTech course`}
  fill
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  className="object-cover transition-transform duration-500 group-hover:scale-105"
  onError={(e) => {
    e.currentTarget.style.display = "none";
    e.currentTarget.parentElement
      ?.querySelector("[data-fallback]")
      ?.classList.remove("hidden");
  }}
/>
<div
  data-fallback
  className="hidden absolute inset-0 flex items-center justify-center bg-secondary text-white"
>
  <span className="text-3xl font-bold tracking-tight opacity-90">
    {course.category}
  </span>
</div>
```

---

## 5. Testimonials (`src/content/testimonials.ts`)

Realistic South Asian portrait photography for student testimonial avatars — all studio-shot, consistent lighting, works well cropped to a circle:

| Name slot | Image URL | Notes |
|---|---|---|
| Testimonial avatar 1 (male) | `https://images.pexels.com/photos/33261955/pexels-photo-33261955.jpeg?auto=compress&cs=tinysrgb&w=300` | Dark background, confident expression |
| Testimonial avatar 2 (male) | `https://images.pexels.com/photos/33261958/pexels-photo-33261958.jpeg?auto=compress&cs=tinysrgb&w=300` | Formal wear, dark backdrop |
| Testimonial avatar 3 (male) | `https://images.pexels.com/photos/33261951/pexels-photo-33261951.jpeg?auto=compress&cs=tinysrgb&w=300` | Beard, formal attire |
| Testimonial avatar 4 (male) | `https://images.pexels.com/photos/33261956/pexels-photo-33261956.jpeg?auto=compress&cs=tinysrgb&w=300` | Sea-green shirt, casual-professional |
| Testimonial avatar 5 (female) | `https://images.pexels.com/photos/34381970/pexels-photo-34381970.jpeg?auto=compress&cs=tinysrgb&w=300` | Business attire, studio portrait |

All four male portraits are from the same photographer/series (Monirul Islam) so they share consistent studio lighting and background tone — good for a cohesive testimonial carousel. Crop to `1:1` and apply `rounded-full` as `TestimonialCarousel.tsx` likely already expects.

```ts
// src/content/testimonials.ts
{
  name: "Student Name",
  avatar: "https://images.pexels.com/photos/33261955/pexels-photo-33261955.jpeg?auto=compress&cs=tinysrgb&w=300",
  // ...
}
```

---

## 6. About Page / Gallery (`app/about/page.tsx`, `src/content/gallery.ts`)

| Use | Image URL | Notes |
|---|---|---|
| Classroom/facility shot | `https://images.pexels.com/photos/10127241/pexels-photo-10127241.jpeg?auto=compress&cs=tinysrgb&w=1400` | Clean, bright modern classroom interior |
| Computer lab (empty, wide) | `https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg?auto=compress&cs=tinysrgb&w=1400` | Good for "Our Facilities" section |
| Students at computer lab (group) | `https://images.pexels.com/photos/5539293/pexels-photo-5539293.jpeg?auto=compress&cs=tinysrgb&w=1400` | Group learning shot |
| Students in classroom (Asia-context) | `https://images.pexels.com/photos/10643463/pexels-photo-10643463.jpeg?auto=compress&cs=tinysrgb&w=1400` | Colorful, engaged classroom |
| Students in classroom (Asia-context, alt) | `https://images.pexels.com/photos/10638115/pexels-photo-10638115.jpeg?auto=compress&cs=tinysrgb&w=1400` | Bright modern classroom |
| Graduation moment | `https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg?auto=compress&cs=tinysrgb&w=1400` | Good for "Success Stories" / About page hero |

---

## 7. CTA Banner / Blog Cover Images

The `CTABanner.tsx` component currently uses a solid gradient background (no photo) — that's the right call per the design-system doc (§0), so no image needed there. For **blog post cover images** (`src/content/blog-posts.ts`), map by topic:

| Blog post | Image URL |
|---|---|
| 5 reasons to learn web development | `https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg?auto=compress&cs=tinysrgb&w=1200` |
| Python vs JavaScript | `https://images.pexels.com/photos/6424590/pexels-photo-6424590.jpeg?auto=compress&cs=tinysrgb&w=1200` |
| Graphic design career guide | `https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=1200` |
| MS Office skills still matter | `https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg?auto=compress&cs=tinysrgb&w=1200` |
| Student success story (Rina) | `https://images.pexels.com/photos/34381970/pexels-photo-34381970.jpeg?auto=compress&cs=tinysrgb&w=1200` |

---

## 8. Full Image Manifest (quick copy-paste reference)

```
HERO_BACKGROUND      = https://images.unsplash.com/photo-1758270705290-62b6294dd044
CODE_CLOSEUP_1       = https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg
CODE_CLOSEUP_2       = https://images.pexels.com/photos/6424590/pexels-photo-6424590.jpeg
GRAPHIC_DESIGN       = https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg
HARDWARE_TECHNICIAN  = https://images.pexels.com/photos/442154/pexels-photo-442154.jpeg
GRADUATION           = https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg
ACCOUNTING           = https://images.pexels.com/photos/8296990/pexels-photo-8296990.jpeg
COMPUTER_LAB_EMPTY   = https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg
STUDENTS_LAB_GROUP   = https://images.pexels.com/photos/5539293/pexels-photo-5539293.jpeg
CLASSROOM_ASIA_1     = https://images.pexels.com/photos/10638115/pexels-photo-10638115.jpeg
CLASSROOM_ASIA_2     = https://images.pexels.com/photos/10643463/pexels-photo-10643463.jpeg
CLASSROOM_ASIA_3     = https://images.pexels.com/photos/10638075/pexels-photo-10638075.jpeg
CLASSROOM_INTERIOR   = https://images.pexels.com/photos/10127241/pexels-photo-10127241.jpeg
PORTRAIT_MALE_1      = https://images.pexels.com/photos/33261955/pexels-photo-33261955.jpeg
PORTRAIT_MALE_2      = https://images.pexels.com/photos/33261958/pexels-photo-33261958.jpeg
PORTRAIT_MALE_3      = https://images.pexels.com/photos/33261951/pexels-photo-33261951.jpeg
PORTRAIT_MALE_4      = https://images.pexels.com/photos/33261956/pexels-photo-33261956.jpeg
PORTRAIT_FEMALE_1    = https://images.pexels.com/photos/34381970/pexels-photo-34381970.jpeg
```
(Append the sizing query string from the tables above depending on where each is used.)

---

## 9. Licensing Notes

- **Pexels License**: Free to use for commercial and non-commercial purposes. No attribution required (though appreciated). Cannot resell unmodified photos as stock, and cannot use identifiable people in a way that's misleading, defamatory, or implies endorsement of a product/service. This is fine for a training institute's own course/marketing pages. Full terms: `pexels.com/license`.
- **Unsplash License**: Same posture — free for commercial and non-commercial use, no permission or attribution required. Full terms: `unsplash.com/license`.
- **Hotlinking vs. self-hosting**: Hotlinking (using the CDN URLs directly, as above) is the fastest way to ship — but for production stability and slightly better performance, consider downloading the final selected images and hosting them in `public/images/` once you've locked in the final set, so the site isn't dependent on a third-party CDN staying up. Both platforms explicitly permit downloading and rehosting under their free licenses.

---

## 10. Checklist

- [ ] Add `images.pexels.com` and `images.unsplash.com` to `next.config.ts` `remotePatterns`
- [ ] Replace Hero's `text_to_image` background call with `HERO_BACKGROUND` URL
- [ ] Reduce Hero floating cards from 4 to 2 (or keep 4 using all listed URLs, per design-doc guidance)
- [ ] Update `src/content/courses.ts` `image` field per §4 category mapping
- [ ] Add the branded fallback `<div data-fallback>` to `CourseCard.tsx` per §4
- [ ] Update `src/content/testimonials.ts` avatar URLs per §5
- [ ] Add images to About/Gallery content per §6
- [ ] Add blog cover images per §7
- [ ] Once the image set is finalized, consider downloading and self-hosting in `public/images/` for production
