# 07 — Content Migration & Seeding

How to move today's `src/content/*` (TypeScript + MDX) into PostgreSQL **safely, repeatably, and verifiably**.

Principles:
1. The seed script is **idempotent** (`upsert` by slug/key) — you can run it repeatedly.
2. **Placeholder content is seeded as DRAFT / unpublished**, so nothing fake goes live by accident.
3. Keep `src/content/*` until a **parity check** passes; only then remove it.
4. Seed data lives in `prisma/seed-data/` after cutover (it is your disaster-recovery baseline).

---

## 1. Mapping table: today → database

| Source | Destination | Transformation rules |
|--------|-------------|----------------------|
| `COURSE_CATEGORY_GROUPS` (`constants.ts`) | `CategoryGroup` | `id` → `slug`, `label` → `label`, array index → `sortOrder` |
| `COURSE_CATEGORIES` (15) | `Category` | `slug = slugify(name)` (`"Business & Accounting"` → `business-accounting`); `groupId` from the group whose `categories` array contains it |
| `courses[]` (37) | `Course` | see §2 |
| `COURSE_IMAGE_URLS` / `course.image` | `Media` (`source: EXTERNAL`) + `Course.coverId` | one Media row per distinct URL; `alt = course.title` |
| `instituteInfo.about / contact / hours / socials / stats / whyChooseUs / facilities` | `SiteSetting` keys `about, contact, hours, socials, stats, whyChooseUs, facilities` | store JSON as-is; `stats` items with `isPlaceholder` are kept but flagged so the admin warns |
| `SITE_CONFIG` + `EVERY_COURSE_INCLUDES` | `SiteSetting` `general`, `everyCourseIncludes` | env overrides (`NEXT_PUBLIC_*`) become fallbacks only |
| `instituteInfo.team` (4, all placeholders) | `TeamMember` | `isPublished: false` |
| `events[]` (5) | `Event` | `startsAt` from `date` + start of `time` range in **Asia/Kathmandu (+05:45)**; `endsAt` from the end of the range; `category` → enum; **status `DRAFT`** (sample dates are past, content is placeholder) |
| `faqCategories` (3 → 10 Q&As) | `FaqCategory`, `Faq` | `isPublished = !isPlaceholder` |
| `testimonials` (empty) | — | nothing to migrate |
| `gallery.ts` + `institute.gallery` | `Media` (EXTERNAL) + `GalleryItem` | unify categories → `CAMPUS, LABS, EVENTS, CLASSES, CERTIFICATIONS` (`Classroom→CLASSES`, `Lab→LABS`, `Certificates→CERTIFICATIONS`); **`isPublished: false`** (stock photos, not the institute) |
| `blog/*.mdx` (5) | `BlogPost`, `Tag` | front-matter → columns; body → `contentMd`; `date` → `publishedAt`; `author` → `authorName`; **status `DRAFT` if the body contains "PLACEHOLDER"** (all 5 do) |
| Forms | `Lead`, `ContactMessage`, `Subscriber` | no history exists to migrate |

---

## 2. Course field transformation

| Source value | Target | Rule |
|--------------|--------|------|
| `duration: "12 Weeks"` | `durationWeeks: 12` | `parseInt` — all 37 values are "N Weeks" |
| `level: "Beginner to Intermediate"` | `BEGINNER_TO_INTERMEDIATE` | map object |
| `learningMode: "Physical / Online / Hybrid"` | `[PHYSICAL, ONLINE, HYBRID]` | split on `/`, trim, uppercase |
| `timing: "Evening / Weekend"` / `"Weekend only"` | `[EVENING, WEEKEND]` / `[WEEKEND]` | split on `/`, strip trailing "only", uppercase |
| `newBatch` | `batchFrequency` | copy |
| `industryCertification: "Google, Meta"` | `["Google","Meta"]` | split on `,`; missing → `[]` |
| `internship`, `seats`, `feeNote` | `internship`, `seatsNote`, `feeNote` | copy |
| `feeNPR` | `feeNPR` | copy (integer) |
| `featured: true` | `isFeatured: true`, `featuredOrder` = order of appearance | 8 featured courses |
| `cta` | `ctaText` | copy |
| missing `overview`, `learningObjectives`, `prerequisites` | `null` / `[]` | only 8 courses have an overview — admin should fill the rest over time |
| `id: "c01"…` | — | **drop** (DB generates `cuid`); keep `slug` as the stable key |

---

## 3. Seed script skeleton — `prisma/seed.ts`

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { courses } from "../src/content/courses";
import { COURSE_CATEGORY_GROUPS, COURSE_CATEGORIES, EVERY_COURSE_INCLUDES } from "../src/lib/constants";
import { instituteInfo } from "../src/content/institute";
// events, faq, gallery, blog imports …

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const LEVEL = { "Beginner":"BEGINNER", "Beginner to Intermediate":"BEGINNER_TO_INTERMEDIATE",
                "Intermediate":"INTERMEDIATE", "Advanced":"ADVANCED" } as const;
const upperList = (s: string) =>
  s.replace(/only/i, "").split("/").map((x) => x.trim().toUpperCase()).filter(Boolean);

async function seedCatalog() {
  // 1) groups + categories
  for (const [i, g] of COURSE_CATEGORY_GROUPS.entries()) {
    const group = await db.categoryGroup.upsert({
      where: { slug: g.id }, update: { label: g.label, sortOrder: i },
      create: { slug: g.id, label: g.label, sortOrder: i },
    });
    for (const [j, name] of g.categories.entries()) {
      await db.category.upsert({
        where: { slug: slugify(name) },
        update: { name, groupId: group.id, sortOrder: j },
        create: { slug: slugify(name), name, groupId: group.id, sortOrder: j },
      });
    }
  }

  // 2) courses
  let featuredOrder = 0;
  for (const [i, c] of courses.entries()) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: slugify(c.category) } });
    const media = await db.media.create({           // (dedupe by url in real code)
      data: { source: "EXTERNAL", url: c.image, alt: c.title, folder: "courses" },
    });
    const data = {
      status: "PUBLISHED" as const,
      title: c.title, tagline: c.tagline, shortDescription: c.shortDescription,
      overview: c.overview ?? null, categoryId: category.id,
      level: LEVEL[c.level],
      durationWeeks: parseInt(c.duration, 10),
      learningModes: upperList(c.learningMode) as any,
      timeSlots: upperList(c.timing) as any,
      batchFrequency: c.newBatch,
      targetStudents: c.targetStudents, prerequisites: c.prerequisites ?? null,
      instituteCertificate: c.instituteCertificate,
      industryCertifications: c.industryCertification?.split(",").map((x) => x.trim()) ?? [],
      internship: c.internship ?? null, seatsNote: c.seats ?? null,
      feeNPR: c.feeNPR ?? 0, feeNote: c.feeNote ?? null,
      skillsGained: c.skillsGained, softwareTools: c.softwareTools,
      portfolioProjects: c.portfolioProjects, careerOpportunities: c.careerOpportunities,
      learningObjectives: c.learningObjectives ?? [],
      ctaText: c.cta ?? null, seoTitle: c.seoTitle ?? null, seoDescription: c.seoDescription ?? null,
      coverId: media.id, isFeatured: !!c.featured,
      featuredOrder: c.featured ? featuredOrder++ : null,
      sortOrder: i, publishedAt: new Date(),
    };
    await db.course.upsert({ where: { slug: c.slug }, update: data, create: { slug: c.slug, ...data } });
  }
}

async function seedSettings() {
  const put = (key: string, value: unknown) =>
    db.siteSetting.upsert({ where: { key }, update: { value: value as any }, create: { key, value: value as any } });
  await put("about", { ...instituteInfo.about });
  await put("contact", { phone: instituteInfo.contact.phone, whatsapp: instituteInfo.contact.whatsapp,
                         email: instituteInfo.contact.email, address: instituteInfo.contact.address });
  await put("hours", instituteInfo.hours);
  await put("socials", instituteInfo.socials);
  await put("stats", instituteInfo.stats);
  await put("whyChooseUs", instituteInfo.whyChooseUs);
  await put("facilities", instituteInfo.facilities);
  await put("everyCourseIncludes", [...EVERY_COURSE_INCLUDES]);
}

async function seedAdmin() {
  // Create the first SUPER_ADMIN through the auth library's API so the password is hashed correctly.
  // 🔎 call your auth library's "create user with credentials" server API here, then set role = SUPER_ADMIN.
}

async function main() {
  await seedCatalog();
  await seedSettings();
  /* seedEvents(), seedFaq(), seedGallery(), seedBlog(), seedTeam() — same upsert pattern, status DRAFT for placeholders */
  await seedAdmin();
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
```

**Blog seeding** (from MDX files):

```ts
import fs from "fs"; import path from "path"; import matter from "gray-matter"; import readingTime from "reading-time";

for (const file of fs.readdirSync("src/content/blog").filter((f) => /\.mdx?$/.test(f))) {
  const { data, content } = matter(fs.readFileSync(path.join("src/content/blog", file), "utf8"));
  const isPlaceholder = /PLACEHOLDER/i.test(content);
  const cover = await db.media.create({ data: { source: "EXTERNAL", url: data.cover, alt: data.title, folder: "blog" } });
  await db.blogPost.upsert({
    where: { slug: data.slug },
    update: {},                                    // don't overwrite edits made in admin on re-seed
    create: {
      slug: data.slug, title: data.title, excerpt: data.excerpt, contentMd: content.trim(),
      coverId: cover.id, authorName: data.author, readingMinutes: Math.ceil(readingTime(content).minutes),
      publishedAt: new Date(data.date),
      status: isPlaceholder || data.isDraft ? "DRAFT" : "PUBLISHED",
      tags: { connectOrCreate: (data.tags ?? []).map((t: string) => ({ where: { slug: slugify(t) }, create: { name: t, slug: slugify(t) } })) },
    },
  });
}
```
> After first real use, content is edited in admin. **Re-running the seed must not overwrite admin edits** → for content tables use `update: {}` (as above) once the site is live; only the initial seed uses full `update`. Safer still: guard the seed with `if (process.env.NODE_ENV === "production") throw …` unless an explicit `SEED_FORCE=1` is set.

---

## 4. Parity verification (do this before deleting `src/content/`)

Create `scripts/verify-seed.ts`:

1. **Counts:** `CategoryGroup = 6`, `Category = 15`, `Course = 37`, featured = 8, `Faq = 10`, `Event = 5`, `BlogPost = 5`.
2. **Deep compare:** for every static course, run `toCourseView(dbRow)` and compare to the original object, field by field, **ignoring `id` and `image`**. Print any differences (these will mostly be whitespace or label formatting — fix the mapper, not the data).
3. **Route smoke test:** with the app running, request every URL from the *old* sitemap (`/`, `/courses`, `/courses/<37 slugs>`, `/about`, `/faq`, `/contact`, `/admissions/inquire`, …) and assert **HTTP 200** and a non-empty `<title>`.
4. **Visual spot-check:** compare 5 pages before/after (home, courses list, one course, about, contact).

Only when all pass: switch pages to the DAL (already done per phase), then delete `src/content/*` runtime imports and move the data files to `prisma/seed-data/`.

---

## 5. Images: from stock placeholders to real media

| Stage | What | Notes |
|-------|------|-------|
| Seed | Course images, blog covers, gallery and marketing art → `/public/images/seed/*`, referenced as same-origin paths (`/images/seed/pexels-10638075.jpg`) | Done. The files were pulled from the stock hosts once and committed, so no third-party host has to appear in CSP `img-src` or in `next.config.mjs` `images.remotePatterns` — those two lists now name Cloudinary only. Provenance is in the filenames and in `public/images/seed/README.md`; student photographs are never committed here |
| Soon after | Replace gallery, team, campus, and testimonial photos with **real photos of the institute** (consent for any identifiable people) | Through `/techdarbar/media`, which uploads to Cloudinary and registers the asset — not by dropping files in `public/`. The code comments already require this before launch |
| Cleanup | Nothing left: no `remotePatterns` entry or `IMAGE_HOSTS` entry points at a stock host, and `tests/seo.test.ts` fails if one comes back | Re-check only if a seed file is ever given an absolute third-party URL again |

Also optimise `public/images/logo/final-logo.png` (1.3 MB) → SVG or a compressed WebP/PNG.

---

## 6. Cut-over & rollback

**Cut-over (per phase, not "big bang"):**
1. Deploy new code with DB seeded and pages reading from DB.
2. Run the parity script + smoke test on staging.
3. Switch production; watch error logs and the 404 report in Search Console for 48 h.

**Rollback:** keep the git tag `v0-static` (Phase 0) deployable. Because URLs never change, rolling back is just redeploying the tag; the database can stay as is.

**Production data safety:** take a `pg_dump` before every production migration or seed; never run `prisma migrate reset` on production.
