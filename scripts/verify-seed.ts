/**
 * Parity verification for the course catalog and the site settings (docs/07 §4).
 *
 * Run it after `prisma/seed.ts`, against a database seeded from `prisma/seed-data`:
 *
 *   npm run verify:seed
 *
 * Courses — it checks three things and exits non-zero on the first failure, so it
 * can be wired into CI later:
 *
 *  1. Counts — 6 groups, 15 categories, 37 courses, 8 featured.
 *  2. Deep compare — every static course is mapped with the same
 *     `toCourseView()` the public pages use and compared field by field,
 *     ignoring `id` and `image` (which is the only value the DB cannot know).
 *  3. Orphan check — every published course points at a real category and every
 *     category belongs to a real group.
 *
 * Settings — a different rule, because an admin is *allowed* to change these
 * values after seeding:
 *
 *  4. Structure is a hard failure — all 10 keys present, each stored value
 *     satisfying its own Zod schema, and every `Media.id` it references existing.
 *  5. Value drift from `prisma/seed-data/site-settings.ts` is only a note, so the
 *     disaster-recovery baseline can be diffed against production.
 *  6. The resolved public view is checked through the same mapper the pages use
 *     (absolute site URL, `wa.me` link, map embed URL, unverified stat flags).
 *
 * `mappers.ts` imports `server-only`, which throws under plain `tsx`, so run it
 * with `npm run verify:seed`: that passes `--tsconfig scripts/tsconfig.scripts.json`,
 * which maps the guard to an empty stub. Nothing about the modules changes.
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { courses as staticCourses } from "../prisma/seed-data/courses";
import { COURSE_CATEGORY_GROUPS } from "../src/lib/constants";
import {
  ALLOWED_LEARNING_MODES,
  ALLOWED_TIME_SLOTS,
  toCourseSeedFields,
  slugify,
} from "../prisma/seed-data/course-rules";
import {
  PLACEHOLDER_CAMPUS_IMAGE,
  SETTING_DEFAULTS,
} from "../prisma/seed-data/site-settings";
import {
  SETTINGS_KEYS,
  parseSettingsValue,
  type AboutSettings,
  type GeneralSettings,
  type HeroSettings,
  type SettingsKey,
} from "../src/lib/validators/settings";
import { resolveSiteSettings } from "../src/lib/settings-view";

/* ------------------------------ expected counts ------------------------------ */

const EXPECTED = {
  categoryGroups: 6,
  categories: 15,
  courses: 37,
  featuredCourses: 8,
} as const;

const problems: string[] = [];
const notes: string[] = [];

function fail(message: string): void {
  problems.push(message);
}

function note(message: string): void {
  notes.push(message);
}

/** Fields that legitimately cannot match the static source. */
const IGNORED_FIELDS = new Set(["id", "image"]);

/* --------------------------------- step 1: counts ---------------------------- */

async function verifyCounts(): Promise<void> {
  const [groups, categories, courses, featured, published] = await Promise.all([
    db.categoryGroup.count(),
    db.category.count(),
    db.course.count(),
    db.course.count({ where: { isFeatured: true } }),
    db.course.count({ where: { status: "PUBLISHED" } }),
  ]);

  const actual = {
    categoryGroups: groups,
    categories,
    courses,
    featuredCourses: featured,
  };

  for (const [key, expected] of Object.entries(EXPECTED) as [
    keyof typeof EXPECTED,
    number
  ][]) {
    const found = actual[key];
    if (found !== expected) {
      fail(`Expected ${expected} ${key}, found ${found}`);
    } else {
      console.log(`  ok  ${key}: ${found}`);
    }
  }

  if (published !== EXPECTED.courses) {
    fail(`Expected all ${EXPECTED.courses} courses to be PUBLISHED, found ${published}`);
  } else {
    console.log(`  ok  published: ${published}`);
  }
}

/* ------------------------------ step 2: deep compare -------------------------- */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Compares the mapper output with the static course, ignoring `id` and `image`. */
async function verifyDeepParity(): Promise<void> {
  // Imported lazily: the mapper is only needed in this step.
  const { toCourseView } = await import("../src/server/dal/mappers");

  const rows = await db.course.findMany({
    include: { category: true, cover: true },
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  let compared = 0;

  for (const source of staticCourses) {
    const row = bySlug.get(source.slug);
    if (!row) {
      fail(`Course "${source.title}" (${source.slug}) is missing from the database`);
      continue;
    }

    // The seed rules are the contract the seeder used, so a mismatch here points
    // at either the mapper or a rule that no longer matches the static file.
    const seedFields = toCourseSeedFields(source);
    if (slugify(source.title) !== row.slug) {
      fail(
        `${source.slug}: slugified title is "${slugify(source.title)}" but the row says "${row.slug}"`
      );
    }
    if (seedFields.level !== row.level) {
      fail(`${source.slug}: level mismatch — rule "${seedFields.level}" vs row "${row.level}"`);
    }
    if (seedFields.durationWeeks !== row.durationWeeks) {
      fail(
        `${source.slug}: duration mismatch — rule ${seedFields.durationWeeks} vs row ${row.durationWeeks}`
      );
    }
    if (seedFields.feeNPR !== row.feeNPR) {
      fail(`${source.slug}: fee mismatch — rule ${seedFields.feeNPR} vs row ${row.feeNPR}`);
    }

    const view = toCourseView(row) as unknown as Record<string, Json>;
    const expected = source as unknown as Record<string, Json>;

    for (const field of Object.keys(expected)) {
      if (IGNORED_FIELDS.has(field)) continue;
      const a = JSON.stringify(expected[field] ?? null);
      const b = JSON.stringify(view[field] ?? null);
      if (a !== b) {
        fail(`${source.slug}.${field}\n    static: ${a}\n    view:   ${b}`);
      }
    }

    compared += 1;
  }

  // The reverse direction: a DB course the static file does not know about is
  // either an admin edit or a stale seed row.
  const staticSlugs = new Set(staticCourses.map((course) => course.slug));
  for (const row of rows) {
    if (!staticSlugs.has(row.slug)) {
      note(`Database has an extra course not in the seed catalog: ${row.slug} (${row.status})`);
    }
  }

  console.log(`  ok  deep compared ${compared} course${compared === 1 ? "" : "s"}`);
}

/* ------------------------------ step 3: relationships ------------------------ */

async function verifyRelationships(): Promise<void> {
  // Relations are required columns, so an "orphan" is a value that points at a
  // row which no longer exists. Two small selects are clearer than a join.
  const [courseCategoryIds, categoryGroupIds, modeRows, slotRows] = await Promise.all([
    db.course.findMany({ select: { categoryId: true } }),
    db.category.findMany({ select: { groupId: true } }),
    db.course.findMany({ select: { slug: true, learningModes: true } }),
    db.course.findMany({ select: { slug: true, timeSlots: true } }),
  ]);

  const existingCategories = new Set(
    (await db.category.findMany({ select: { id: true } })).map((row) => row.id)
  );
  const existingGroups = new Set(
    (await db.categoryGroup.findMany({ select: { id: true } })).map((row) => row.id)
  );

  const orphanCourses = courseCategoryIds.filter(
    (row) => !existingCategories.has(row.categoryId)
  ).length;
  const orphanCategories = categoryGroupIds.filter(
    (row) => !existingGroups.has(row.groupId)
  ).length;

  if (orphanCourses > 0) fail(`${orphanCourses} course(s) point at a missing category`);
  else console.log("  ok  every course belongs to a category");

  if (orphanCategories > 0) fail(`${orphanCategories} categor(y/ies) point at a missing group`);
  else console.log("  ok  every category belongs to a group");

  const allowedModes = new Set<string>(ALLOWED_LEARNING_MODES);
  const allowedSlots = new Set<string>(ALLOWED_TIME_SLOTS);

  for (const course of modeRows) {
    for (const mode of course.learningModes) {
      if (!allowedModes.has(mode)) fail(`${course.slug}: unknown learning mode "${mode}"`);
    }
  }
  for (const course of slotRows) {
    for (const slot of course.timeSlots) {
      if (!allowedSlots.has(slot)) fail(`${course.slug}: unknown time slot "${slot}"`);
    }
  }
  console.log("  ok  enum lists are valid");

  // Group labels are what /courses renders, so a mismatch means a broken filter.
  const groups = await db.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });
  if (groups.length !== COURSE_CATEGORY_GROUPS.length) {
    fail(
      `Group count mismatch: database ${groups.length} vs src/lib/constants ${COURSE_CATEGORY_GROUPS.length}`
    );
  }
  for (const [index, group] of COURSE_CATEGORY_GROUPS.entries()) {
    const stored = groups[index];
    if (!stored) {
      fail(`Group "${group.label}" is missing from the database`);
      continue;
    }
    if (stored.label !== group.label || stored.slug !== slugify(group.label)) {
      fail(`Group "${group.label}" does not match the stored group "${stored.label}"`);
    }
    const storedNames = stored.categories.map((category) => category.name);
    const staticNames = group.categories;
    if (storedNames.join("|") !== staticNames.join("|")) {
      fail(
        `Group "${group.label}" categories differ\n    static: ${staticNames.join(", ")}\n    db:     ${storedNames.join(", ")}`
      );
    }
  }
  console.log("  ok  category groups match src/lib/constants");
}

/* ------------------------------ step 4-6: settings --------------------------- */

async function verifySettings(): Promise<void> {
  const rows = await db.siteSetting.findMany({ orderBy: { key: "asc" } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  /* structure: hard failures */

  const expectedKeys: string[] = [...SETTINGS_KEYS].sort();
  const foundKeys = rows.map((row) => row.key).sort();
  if (foundKeys.length !== expectedKeys.length) {
    fail(`Expected ${expectedKeys.length} SiteSetting rows, found ${foundKeys.length}`);
  }
  for (const key of expectedKeys) {
    if (!foundKeys.includes(key)) fail(`SiteSetting "${key}" is missing`);
  }
  for (const key of foundKeys) {
    if (!expectedKeys.includes(key)) note(`Database has an unexpected SiteSetting key: ${key}`);
  }
  if (rows.length === expectedKeys.length) console.log(`  ok  keys: ${foundKeys.join(", ")}`);

  // A stored value that fails its own schema is what the resolver silently
  // ignores, so the public site would quietly show the fallback. Catch it here.
  let validated = 0;
  for (const key of expectedKeys) {
    const value = byKey.get(key);
    if (value === undefined) continue;
    const parsed = parseSettingsValue(key as SettingsKey, value);
    if (!parsed.success) {
      fail(`${key}: stored value does not satisfy ${key}Schema — the public site would fall back`);
      continue;
    }
    validated += 1;
  }
  if (validated === expectedKeys.length) console.log(`  ok  schema: ${validated} values validated`);

  /* media references */

  const general = byKey.get("general") as GeneralSettings | undefined;
  const about = byKey.get("about") as AboutSettings | undefined;
  const hero = byKey.get("hero") as HeroSettings | undefined;
  const mediaIds = [
    general?.logoMediaId,
    about?.campusMediaId,
    hero?.imageMediaId,
    hero?.popupMediaId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const media = await db.media.findMany({
    where: { id: { in: mediaIds } },
    select: { id: true, url: true, source: true, folder: true },
  });
  const mediaById = new Map(media.map((row) => [row.id, row]));

  for (const id of mediaIds) {
    if (!mediaById.has(id)) {
      fail(`${id}: settings reference a Media row that does not exist`);
    }
  }
  if (about?.campusMediaId) {
    const campus = mediaById.get(about.campusMediaId);
    if (campus && campus.url !== PLACEHOLDER_CAMPUS_IMAGE) {
      fail(
        `about.campusMediaId points at "${campus.url}" instead of the seeded ${PLACEHOLDER_CAMPUS_IMAGE}`
      );
    } else if (campus) {
      console.log(`  ok  campus photo: ${campus.url}`);
    }
  } else {
    note("about.campusMediaId is empty — the about page renders the stock campus photo");
  }

  /* drift from the seed baseline: notes only, an admin may have edited these */

  /**
   * Fields the seeder derives instead of copying: `siteUrl` follows
   * `NEXT_PUBLIC_SITE_URL`, and the two media ids are `Media.id` values the
   * database invents. Everything else must match the baseline literally.
   */
  const MACHINE_OWNED = new Set([
    "siteUrl",
    "logoMediaId",
    "campusMediaId",
    "imageMediaId",
    "popupMediaId",
  ]);

  const drift = (key: string, stored: unknown, baseline: unknown): boolean => {
    if (stored && baseline && typeof stored === "object" && typeof baseline === "object" && !Array.isArray(stored)) {
      const a = stored as Record<string, unknown>;
      const b = baseline as Record<string, unknown>;
      return Object.keys(b).some(
        (field) => !MACHINE_OWNED.has(field) && JSON.stringify(a[field]) !== JSON.stringify(b[field])
      );
    }
    return JSON.stringify(stored) !== JSON.stringify(baseline);
  };

  let drifted = 0;
  for (const key of expectedKeys) {
    const stored = byKey.get(key);
    if (stored === undefined) continue;
    if (drift(key, stored, SETTING_DEFAULTS[key as SettingsKey])) {
      drifted += 1;
      note(`${key} differs from the seed baseline in prisma/seed-data/site-settings.ts`);
    }
  }
  if (drifted === 0) console.log("  ok  no drift from the seed baseline");

  /* the resolved public view, through the mapper the pages use */

  const view = resolveSiteSettings(
    rows.map((row) => ({ key: row.key, value: row.value })),
    Object.fromEntries(media.map((row) => [row.id, row.url])),
    process.env
  );

  const absolute = /^https?:\/\//i;
  if (!absolute.test(view.general.siteUrl)) fail(`Resolved site URL is not absolute: ${view.general.siteUrl}`);
  if (!absolute.test(view.contact.whatsappHref)) fail(`Resolved WhatsApp link is not absolute: ${view.contact.whatsappHref}`);
  if (!/^https:\/\/wa\.me\/\d+$/.test(view.contact.whatsappHref)) {
    fail(`Resolved WhatsApp link is not a wa.me number: ${view.contact.whatsappHref}`);
  }
  if (!view.contact.mapEmbedUrl.startsWith("https://www.google.com/maps?q=")) {
    fail(`Resolved map embed URL is unexpected: ${view.contact.mapEmbedUrl}`);
  }
  if (view.contact.mapEmbedUrl.includes("<")) fail("Resolved map embed URL contains markup");
  if (view.hours.length === 0) fail("Resolved opening hours are empty");
  if (view.stats.length === 0) fail("Resolved stats are empty");

  const unverified = view.stats.filter((stat) => stat.isPlaceholder).length;
  console.log(
    `  ok  view: ${view.general.siteUrl} · ${view.hours.length} hour rows · ${view.stats.length} stats (${unverified} unverified)`
  );
}

/* ----------------------------------- run ------------------------------------- */

async function main(): Promise<void> {
  console.log("Verifying course catalog parity (docs/07 §4)\n");

  console.log("Counts");
  await verifyCounts();

  console.log("\nCourse field parity");
  await verifyDeepParity();

  console.log("\nRelationships");
  await verifyRelationships();

  console.log("\nSite settings");
  await verifySettings();

  if (notes.length > 0) {
    console.log(`\nNotes (${notes.length}):`);
    for (const message of notes) console.log(`  - ${message}`);
  }

  if (problems.length > 0) {
    console.error(`\nFAILED with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error("\nverify-seed failed to run:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
