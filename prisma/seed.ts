import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { courses } from "./seed-data/courses";
import { getAllBlogPosts } from "./seed-data/blog-posts";
import { events as staticEvents } from "./seed-data/events";
import { galleryImages } from "./seed-data/gallery";
import { faqCategories } from "./seed-data/faq";
import { instituteInfo } from "./seed-data/institute";
import { COURSE_CATEGORY_GROUPS } from "../src/lib/constants";
import { slugify, toCourseSeedFields } from "./seed-data/course-rules";
import {
  PLACEHOLDER_CAMPUS_IMAGE,
  SETTING_DEFAULTS,
  SETTINGS_MEDIA_FOLDER,
} from "./seed-data/site-settings";
import { SETTINGS_SCHEMAS, type SettingsKey } from "../src/lib/validators/settings";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Every course cover lives in one folder so re-runs can reuse the rows. */
const COURSE_MEDIA_FOLDER = "courses";

/** One folder per content type, so a re-run reuses its Media rows. */
const BLOG_MEDIA_FOLDER = "blog";
const GALLERY_MEDIA_FOLDER = "gallery";
const EVENT_MEDIA_FOLDER = "events";

/** Asia/Kathmandu is UTC+05:45 and has no DST (AGENTS.md: dates are stored UTC). */
const KATHMANDU_UTC_OFFSET = "+05:45";

/** Kathmandu, used to turn the static content's local wall-clock into UTC. */
function kathmanduDateTime(date: string, time?: string): Date {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(time?.trim() ?? "");
  let hours = 10;
  let minutes = 0;
  if (match) {
    hours = Number(match[1]) % 12;
    minutes = Number(match[2]);
    if (match[3]?.toUpperCase() === "PM") hours += 12;
  }
  const [year, month, day] = date.split("-").map(Number);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00${KATHMANDU_UTC_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cannot parse date "${date}" (time: "${time ?? ""}")`);
  }
  return parsed;
}

/** Splits "10:00 AM – 4:00 PM" into its start and (optional) end half. */
function splitEventTime(time: string): { start?: string; end?: string } {
  const [start, end] = time.split(/\s*[–—-]\s*/);
  return { start: start?.trim(), end: end?.trim() };
}

function readingMinutes(readingTime: string): number {
  const minutes = Number(/(\d+)/.exec(readingTime)?.[1] ?? 1);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 1;
}

/** Event categories in the static content are title-case; the enum is SCREAMING_CASE. */
const EVENT_CATEGORY_BY_LABEL: Record<string, "OPEN_HOUSE" | "WORKSHOP" | "SEMINAR" | "CERTIFICATION" | "OTHER"> = {
  "Open House": "OPEN_HOUSE",
  Workshop: "WORKSHOP",
  Seminar: "SEMINAR",
  Certification: "CERTIFICATION",
  Other: "OTHER",
};

const GALLERY_CATEGORY_BY_LABEL: Record<string, "CAMPUS" | "LABS" | "EVENTS" | "CLASSES" | "CERTIFICATIONS"> = {
  Campus: "CAMPUS",
  Labs: "LABS",
  Events: "EVENTS",
  Classes: "CLASSES",
  Certifications: "CERTIFICATIONS",
};

/**
 * Creates the first SUPER_ADMIN (docs/02 §4, docs/04 §1.3).
 *
 * Staff accounts are never created through the running app — public sign-up is
 * disabled in `src/server/auth.ts` with `emailAndPassword.disableSignUp`. That
 * is why this script builds its own Better Auth instance with sign-up enabled:
 * it is the only place in the codebase allowed to create a user that way. Do not
 * copy the application auth config in here — it would disable the one call this
 * script depends on.
 */
const seedAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  secret: process.env.AUTH_SECRET,
});

const MIN_PASSWORD_LENGTH = 10;

/**
 * Values that appear in .env.example, the README and the docs as examples. A
 * seeded super admin can mint every other account, so the script refuses these
 * outright rather than relying on the operator remembering to replace them.
 */
const PLACEHOLDER_ADMIN_PASSWORDS = new Set([
  "change-me-on-first-login",
  "change-me",
  "changeme",
  "password",
  "admin123",
  "darbar123",
]);

/**
 * 6 category groups, 15 categories and the 37 courses (docs/07 §1–2, docs/04
 * §3.1). Everything is upserted by slug, so the script is safe to re-run.
 *
 * Course rows are seeded as PUBLISHED: this content is production-quality and
 * already live on the static site (docs/04 §3.1). Only `overview` is missing on
 * 29 of the 37 courses — the admin fills those in over time.
 */
async function seedCatalog() {
  const categoryIdBySlug = new Map<string, string>();

  for (const [groupIndex, group] of COURSE_CATEGORY_GROUPS.entries()) {
    const savedGroup = await prisma.categoryGroup.upsert({
      where: { slug: group.id },
      update: { label: group.label, sortOrder: groupIndex },
      create: { slug: group.id, label: group.label, sortOrder: groupIndex },
    });

    for (const [categoryIndex, name] of group.categories.entries()) {
      const slug = slugify(name);
      const savedCategory = await prisma.category.upsert({
        where: { slug },
        update: { name, groupId: savedGroup.id, sortOrder: categoryIndex },
        create: { slug, name, groupId: savedGroup.id, sortOrder: categoryIndex },
      });
      categoryIdBySlug.set(slug, savedCategory.id);
    }
  }

  // One Media row per distinct image URL (docs/07 §1). Read once up front so a
  // re-run reuses the existing rows instead of creating duplicates.
  const existingMedia = await prisma.media.findMany({
    where: { folder: COURSE_MEDIA_FOLDER },
    select: { id: true, url: true },
  });
  const mediaIdByUrl = new Map(existingMedia.map((row) => [row.url, row.id]));

  let featuredOrder = 0;

  for (const [index, course] of courses.entries()) {
    const categoryId = categoryIdBySlug.get(slugify(course.category));
    if (!categoryId) {
      throw new Error(
        `Course "${course.slug}" has no category: "${course.category}" is not in COURSE_CATEGORY_GROUPS`
      );
    }

    let coverId = mediaIdByUrl.get(course.image);
    if (!coverId) {
      const media = await prisma.media.create({
        data: {
          source: "EXTERNAL",
          url: course.image,
          alt: course.title,
          folder: COURSE_MEDIA_FOLDER,
        },
      });
      coverId = media.id;
      mediaIdByUrl.set(course.image, coverId);
    }

    const fields = toCourseSeedFields(course);

    // publishedAt is set once and then preserved, so re-running the seed does
    // not reset the "published on" date of a course an editor has touched.
    const existing = await prisma.course.findUnique({
      where: { slug: course.slug },
      select: { publishedAt: true },
    });

    const data = {
      status: "PUBLISHED" as const,
      ...fields,
      categoryId,
      coverId,
      featuredOrder: fields.isFeatured ? featuredOrder++ : null,
      sortOrder: index,
      publishedAt: existing?.publishedAt ?? new Date(),
    };

    await prisma.course.upsert({
      where: { slug: course.slug },
      update: data,
      create: { slug: course.slug, ...data },
    });
  }
}

/** Prints the counts docs/04 §3.1 asks to verify after a seed run. */
async function printCatalogSummary() {
  const [groups, categories, total, featured] = await Promise.all([
    prisma.categoryGroup.count(),
    prisma.category.count(),
    prisma.course.count(),
    prisma.course.count({ where: { isFeatured: true } }),
  ]);

  console.log(
    `Catalog: CategoryGroup=${groups} Category=${categories} Course=${total} featured=${featured}`
  );

  const expected = { groups: 6, categories: 15, courses: 37, featured: 8 };
  const actual = {
    groups,
    categories,
    courses: total,
    featured,
  };
  // Only *missing* content is a failure. Extra categories/featured courses are
  // legitimate editorial additions (the admin can add categories), so they are
  // reported but do not fail the run.
  const missing = Object.entries(expected).filter(
    ([key, value]) => actual[key as keyof typeof actual] < value
  );
  const extra = Object.entries(expected).filter(
    ([key, value]) => actual[key as keyof typeof actual] > value
  );

  if (missing.length > 0) {
    console.error(
      `Missing content: ${missing
        .map(([key, value]) => `${key} expected >=${value}, got ${actual[key as keyof typeof actual]}`)
        .join("; ")}`
    );
    process.exitCode = 1;
  }
  if (extra.length > 0) {
    console.log(
      `Note: extra rows added in admin (kept): ${extra
        .map(([key, value]) => `${key} baseline ${value}, now ${actual[key as keyof typeof actual]}`)
        .join("; ")}`
    );
  }
}

/**
 * Reads and validates the super-admin credentials. Called at the very start of
 * `main()` so a bad `SEED_ADMIN_PASSWORD` stops the run before a single row is
 * written, rather than leaving a half-seeded database behind.
 */
function readAdminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";

  if (!email || !password) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set (see .env.example)"
    );
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
    process.exit(1);
  }
  // The documented placeholder is longer than MIN_PASSWORD_LENGTH, so the length
  // check alone would happily seed it. This account can mint every other one.
  if (PLACEHOLDER_ADMIN_PASSWORDS.has(password.trim().toLowerCase())) {
    console.error(
      "SEED_ADMIN_PASSWORD is still the documented placeholder. Set a real password before seeding."
    );
    process.exit(1);
  }

  return { email, password, name };
}

async function seedSuperAdmin(admin: { email: string; password: string; name: string } = readAdminCredentials()) {
  const { email, password, name } = admin;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true },
  });

  if (existing) {
    // Idempotent: re-running the seed must not fail, and must guarantee the
    // owner is an active super admin (docs/08 §1: always >= 1 active
    // SUPER_ADMIN).
    if (existing.role === "SUPER_ADMIN" && existing.isActive) {
      console.log(`Super admin ${email} already exists — nothing to do.`);
    } else {
      await prisma.user.update({
        where: { email },
        data: { role: "SUPER_ADMIN" as Role, isActive: true },
      });
      console.log(
        `Updated ${email}: role=${existing.role} -> SUPER_ADMIN, isActive=${existing.isActive} -> true`
      );
    }
  } else {
    await seedAuth.api.signUpEmail({
      body: { email, password, name },
    });
    await prisma.user.update({
      where: { email },
      data: { role: "SUPER_ADMIN" as Role, isActive: true },
    });
    console.log(`Created SUPER_ADMIN: ${email}`);
    console.log(
      "Change this password after the first sign-in (docs/08 §6 go-live checklist)."
    );
  }
}

/**
 * The ten `SiteSetting` groups (docs/07 §1, docs/03 §4).
 *
 * Values come from `prisma/seed-data/site-settings.ts` — a verbatim copy of the
 * static content, so re-seeding restores today's public pages exactly. Every value
 * is validated with the same Zod schema the admin form uses before it is written,
 * which means a typo in the seed data fails the seed instead of poisoning the
 * public read (which would silently fall back to defaults).
 *
 * `about.campusMediaId` is resolved to a real `Media` row here so the about page
 * keeps its current photo and the field becomes editable from the media library.
 *
 * docs/07 §1 makes the seed an idempotent restore of the baseline, so an existing
 * row is overwritten. That does discard admin edits, so every overwrite is logged:
 * running the seed against a live database is a deliberate act, not a silent one.
 */
async function seedSettings() {
  const mediaIdByUrl = new Map<string, string>();
  const existingMedia = await prisma.media.findMany({
    where: { folder: SETTINGS_MEDIA_FOLDER },
    select: { id: true, url: true },
  });
  for (const row of existingMedia) mediaIdByUrl.set(row.url, row.id);

  async function campusMediaId(): Promise<string | null> {
    const existing = mediaIdByUrl.get(PLACEHOLDER_CAMPUS_IMAGE);
    if (existing) return existing;
    const media = await prisma.media.create({
      data: {
        source: "EXTERNAL",
        url: PLACEHOLDER_CAMPUS_IMAGE,
        alt: "DarbarTech computer lab campus",
        folder: SETTINGS_MEDIA_FOLDER,
      },
    });
    mediaIdByUrl.set(PLACEHOLDER_CAMPUS_IMAGE, media.id);
    return media.id;
  }

  const values: Record<SettingsKey, unknown> = {
    ...SETTING_DEFAULTS,
    about: { ...SETTING_DEFAULTS.about, campusMediaId: await campusMediaId() },
  };

  for (const [key, value] of Object.entries(values) as [SettingsKey, unknown][]) {
    const parsed = (SETTINGS_SCHEMAS[key] as { safeParse: (v: unknown) => { success: boolean; data?: unknown } }).safeParse(
      value
    );
    if (!parsed.success) {
      throw new Error(`Seed data for SiteSetting "${key}" does not match its schema`);
    }
    const existing = await prisma.siteSetting.findUnique({ where: { key }, select: { value: true } });
    // Compared with sorted keys: `SiteSetting.value` is JSONB, which does not
    // preserve key order, so a plain JSON.stringify would report every object as
    // "edited" and cry wolf on every run.
    if (existing && stableStringify(existing.value) !== stableStringify(parsed.data)) {
      console.warn(`  warn SiteSetting "${key}": overwriting an edited value with the seed baseline`);
    }
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: parsed.data as never },
      create: { key, value: parsed.data as never },
    });
  }

  const stored = await prisma.siteSetting.count();
  console.log(`Settings: SiteSetting=${stored}`);
}

/**
 * Returns a `url -> Media.id` resolver scoped to one folder, creating the row on
 * first sight. Re-running the seed reuses the existing rows instead of piling up
 * duplicates, which is what keeps the media library editable by hand afterwards.
 */
async function mediaResolver(folder: string) {
  const existing = await prisma.media.findMany({
    where: { folder },
    select: { id: true, url: true },
  });
  const idByUrl = new Map(existing.map((row) => [row.url, row.id]));

  return async function resolveMedia(url: string, alt: string): Promise<string> {
    const known = idByUrl.get(url);
    if (known) return known;
    const media = await prisma.media.create({
      data: { source: "EXTERNAL", url, alt, folder },
    });
    idByUrl.set(url, media.id);
    return media.id;
  };
}

/**
 * Moves the remaining static content into the database: blog posts, gallery
 * photos, events, FAQs and the team (docs/07 §1). Without this the public
 * `/blog`, `/gallery`, `/events` and `/about` pages render their empty states,
 * because the pages read through the DALs and those tables were never seeded.
 *
 * Everything here is still PLACEHOLDER copy (the source files say so in their
 * first line), so it is seeded **unpublished** per the project's content rule.
 * The pages render their empty states until an editor reviews and publishes a
 * row from the admin panel:
 *
 *   UPDATE "BlogPost" SET status='PUBLISHED' WHERE …;
 *   UPDATE "GalleryItem" SET "isPublished"=true WHERE …;
 *   UPDATE "Event" SET status='PUBLISHED' WHERE …;
 *
 * Every write is an upsert keyed on the static content's own id/slug/name, so the
 * script is safe to re-run and an editor's later changes are overwritten only
 * where the seed actually writes.
 */
async function seedContent() {
  const resolveBlogMedia = await mediaResolver(BLOG_MEDIA_FOLDER);
  const resolveGalleryMedia = await mediaResolver(GALLERY_MEDIA_FOLDER);
  const resolveEventMedia = await mediaResolver(EVENT_MEDIA_FOLDER);

  // ── Blog posts ──
  for (const post of getAllBlogPosts()) {
    const coverId = await resolveBlogMedia(post.cover, post.title);
    const tagIds: string[] = [];
    for (const tag of post.tags ?? []) {
      const saved = await prisma.tag.upsert({
        where: { slug: slugify(tag) },
        update: { name: tag },
        create: { name: tag, slug: slugify(tag) },
      });
      tagIds.push(saved.id);
    }

    const existing = await prisma.blogPost.findUnique({
      where: { slug: post.slug },
      select: { publishedAt: true },
    });

    const data = {
      status: "DRAFT" as const,
      title: post.title,
      excerpt: post.excerpt,
      contentMd: post.content,
      coverId,
      authorName: post.author,
      readingMinutes: readingMinutes(post.readingTime),
      publishedAt: existing?.publishedAt ?? new Date(`${post.date}T00:00:00Z`),
    };

    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: { ...data, tags: { set: tagIds.map((id) => ({ id })) } },
      create: { slug: post.slug, ...data, tags: { connect: tagIds.map((id) => ({ id })) } },
    });
  }

  // ── Gallery ──
  for (const [index, item] of galleryImages.entries()) {
    const mediaId = await resolveGalleryMedia(item.src, item.alt);
    const category = GALLERY_CATEGORY_BY_LABEL[item.category];
    if (!category) throw new Error(`Unknown gallery category "${item.category}"`);

    const data = {
      mediaId,
      title: item.title ?? null,
      alt: item.alt,
      category,
      takenAt: item.date ? new Date(`${item.date}T00:00:00Z`) : null,
      sortOrder: index,
      isPublished: false,
    };

    await prisma.galleryItem.upsert({
      where: { id: item.id },
      update: data,
      create: { id: item.id, ...data },
    });
  }

  // ── Events ──
  for (const event of staticEvents) {
    const coverId = await resolveEventMedia(event.image, event.title);
    const category = EVENT_CATEGORY_BY_LABEL[event.category];
    if (!category) throw new Error(`Unknown event category "${event.category}"`);

    const { start, end } = splitEventTime(event.time);
    const data = {
      status: "DRAFT" as const,
      title: event.title,
      category,
      startsAt: kathmanduDateTime(event.date, start),
      endsAt: end ? kathmanduDateTime(event.date, end) : null,
      location: event.location,
      shortDescription: event.shortDescription,
      fullDescription: event.fullDescription,
      coverId,
    };

    await prisma.event.upsert({
      where: { slug: event.slug },
      update: data,
      create: { slug: event.slug, ...data },
    });
  }

  // ── FAQs ──
  for (const [categoryIndex, group] of faqCategories.entries()) {
    const category = await prisma.faqCategory.upsert({
      where: { name: group.category },
      update: { sortOrder: categoryIndex },
      create: { name: group.category, sortOrder: categoryIndex },
    });

    for (const [sortOrder, item] of group.items.entries()) {
      const data = {
        categoryId: category.id,
        question: item.question,
        answer: item.answer,
        sortOrder,
        isPublished: true,
      };
      await prisma.faq.upsert({
        where: { id: item.id },
        update: data,
        create: { id: item.id, ...data },
      });
    }
  }

  // ── Team ──
  // Portrait URLs point at rows the owner already uploaded through the media
  // library, so the seed reuses the existing Media row by URL instead of
  // creating a second copy of the same file.
  for (const [sortOrder, member] of instituteInfo.team.entries()) {
    const photo = member.image
      ? await prisma.media.findFirst({
          where: { url: member.image },
          select: { id: true },
        })
      : null;
    if (member.image && !photo) {
      console.warn(
        `Warning: no media row for ${member.name} (${member.image}) — run once in the admin media library first`
      );
    }
    const data = {
      name: member.name,
      role: member.role,
      specialty: member.specialty,
      bio: null,
      photoId: photo?.id ?? null,
      sortOrder,
      isPublished: true,
    };
    await prisma.teamMember.upsert({
      where: { id: member.id },
      update: data,
      create: { id: member.id, ...data },
    });
  }

  const [posts, tags, gallery, eventRows, faqs, faqCategoriesStored, team] =
    await Promise.all([
      prisma.blogPost.count(),
      prisma.tag.count(),
      prisma.galleryItem.count(),
      prisma.event.count(),
      prisma.faq.count(),
      prisma.faqCategory.count(),
      prisma.teamMember.count(),
    ]);

  console.log(
    `Content: BlogPost=${posts} Tag=${tags} GalleryItem=${gallery} Event=${eventRows} FaqCategory=${faqCategoriesStored} Faq=${faqs} TeamMember=${team}`
  );

  // Testimonials stay empty on purpose: there is no seed file for them because
  // the real quotes need student names and written consent (docs/07 §1).
  // Nothing to seed.
  const testimonials = await prisma.testimonial.count();
  console.log(
    `Content: Testimonial=${testimonials} (no seed data — add real, consented quotes in the admin)`
  );

  // The seed writes straight to Postgres, so it cannot call revalidateTag(). Public
  // pages keep serving the pre-seed empty state until the build output is dropped:
  // clearing .next/cache alone was not enough, the prerendered pages in .next/dev
  // kept the old markup, so the whole .next directory has to go.
  console.log(
    "Next: stop the dev server, then clear the build output so the pages pick this up —\n" +
      "  rm -rf .next                  # macOS/Linux\n" +
      "  Remove-Item -Recurse -Force .next   # Windows PowerShell\n" +
      "  then run: npm run dev"
  );
}

const SAMPLE_SIGNATORIES = [
  {
    name: "Institute Director",
    title: "Executive Director",
    designation: "Darbar Computer Institute",
    isActive: true,
    displayOrder: 0,
    signatureUrl: null,
  },
  {
    name: "Program Coordinator",
    title: "Academic Coordinator",
    designation: "Training & Certification Division",
    isActive: true,
    displayOrder: 1,
    signatureUrl: null,
  },
] as const;

/**
 * Versioned print geometry for the certificate template (print spec §15: the
 * production renderer must own a versioned template config, not depend on an
 * unversioned PSD). Millimetre coordinates come straight from
 * `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`; the values
 * are duplicated here on purpose so the seed does not read the untracked
 * reference checkout at run time.
 *
 * `safeAreaMm` is the "5-8mm inside trim" rule from print spec §3. The corner
 * ribbons deliberately sit at negative coordinates so they bleed off-canvas.
 */
const SAMPLE_TEMPLATE = {
  name: "Darbar Standard A4 Landscape",
  version: "1.0",
  isActive: true,
  layoutConfig: {
    pageSize: "A4",
    orientation: "landscape",
    // 297 x 210 mm trim, 3508 x 2480 px at 300 DPI.
    trimMm: { width: 297, height: 210 },
    canvasPx: { width: 3508, height: 2480, dpi: 300 },
    bleedMm: 3,
    safeAreaMm: 6,
    units: "mm",
    fontSizeUnits: "pt",
    zones: {
      recipient_name: { x: 87.5, y: 64.0, w: 121.0, h: 10.8 },
      program_title: { x: 69.8, y: 92.0, w: 180.2, h: 4.3 },
      duration_sentence: { x: 26.9, y: 101.3, w: 252.1, h: 3.8 },
      certificate_meta: { x: 189.0, y: 13.0, w: 25.8, h: 6.9 },
      certificate_number: { x: 216.0, y: 13.3, w: 33.2, h: 6.0 },
      qr: { x: 254.1, y: 9.5, w: 14.7, h: 14.6 },
      modules_heading: { x: 127.8, y: 112.8, w: 47.5, h: 2.7 },
      module_columns: 4,
      completion_statement: { x: 64.3, y: 142.3, w: 168.1, h: 8.2 },
      grade_badge: { x: 122.9, y: 155.3, w: 50.4, h: 8.6 },
      issue_date: { x: 42.0, y: 182.5, w: 29.5, h: 2.0 },
      signatory_1: { x: 139.4, y: 183.4, w: 28.1, h: 2.1 },
      signatory_2: { x: 221.5, y: 183.6, w: 24.0, h: 2.1 },
      footer_bar: { x: 7.6, y: 191.5, w: 230.8, h: 12.3 },
      primary_logo: { x: 43.6, y: 12.8, w: 84.2, h: 16.3 },
      watermark_logo: { x: 228.9, y: 53.5, w: 70.7, h: 55.2 },
      corner_ribbon_top_left: { x: -17.3, y: 2.5, w: 41.8, h: 38.3 },
      corner_ribbon_bottom_right: { x: 212.9, y: 177.0, w: 89.3, h: 28.5 },
    },
  },
} as const;

async function seedCertificates() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    console.log("Certificates: skipped in production (set SEED_FORCE=1 to override)");
    return;
  }

  for (const sig of SAMPLE_SIGNATORIES) {
    const existing = await prisma.certificateSignatory.findFirst({
      where: { name: sig.name, title: sig.title },
      select: { id: true },
    });
    if (existing) {
      await prisma.certificateSignatory.update({
        where: { id: existing.id },
        data: {
          designation: sig.designation,
          isActive: sig.isActive,
          displayOrder: sig.displayOrder,
          signatureUrl: sig.signatureUrl,
        },
      });
    } else {
      await prisma.certificateSignatory.create({
        data: {
          name: sig.name,
          title: sig.title,
          designation: sig.designation,
          isActive: sig.isActive,
          displayOrder: sig.displayOrder,
          signatureUrl: sig.signatureUrl,
        },
      });
    }
  }

  const existingTpl = await prisma.certificateTemplate.findFirst({
    where: { name: SAMPLE_TEMPLATE.name, version: SAMPLE_TEMPLATE.version },
    select: { id: true },
  });
  if (existingTpl) {
    await prisma.certificateTemplate.update({
      where: { id: existingTpl.id },
      data: {
        isActive: SAMPLE_TEMPLATE.isActive,
        layoutConfig: SAMPLE_TEMPLATE.layoutConfig as never,
      },
    });
  } else {
    await prisma.certificateTemplate.create({
      data: {
        name: SAMPLE_TEMPLATE.name,
        version: SAMPLE_TEMPLATE.version,
        isActive: SAMPLE_TEMPLATE.isActive,
        layoutConfig: SAMPLE_TEMPLATE.layoutConfig as never,
      },
    });
  }

  const [signatoryCount, templateCount] = await Promise.all([
    prisma.certificateSignatory.count(),
    prisma.certificateTemplate.count(),
  ]);
  console.log(
    `Certificates: CertificateSignatory=${signatoryCount} CertificateTemplate=${templateCount}`
  );
}

/** JSON with object keys sorted, so two equal values always stringify equal. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      );
    }
    return val;
  });
}

async function main() {
  // The catalog upsert writes every column, so a re-seed in production would
  // silently undo admin edits (docs/07 §3). Refuse unless it is explicit.
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    console.error(
      "Refusing to seed the catalog in production. Re-seeding overwrites admin edits; set SEED_FORCE=1 if that is really what you want."
    );
    process.exit(1);
  }

  // Validated up front: a placeholder password should stop the run, not end it
  // after the catalog, content and settings have already been written.
  const admin = readAdminCredentials();

  await seedCatalog();
  await printCatalogSummary();
  await seedContent();
  await seedSettings();
  await seedSuperAdmin(admin);
  await seedCertificates();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(1);
  });
