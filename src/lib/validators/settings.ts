import { z } from "zod";
import { cuidLike, phoneSchema, requiredEmailSchema } from "./shared";

/**
 * Site settings form rules (docs/03 §4, docs/05 §4.13).
 *
 * Imported by the admin settings panel ("use client") and by the Server Action,
 * so this module must never import Prisma or `server-only`.
 *
 * One Zod schema per `SiteSetting.key`. The action picks the schema from the key
 * the form submitted, so a tab can only ever write its own group.
 */
export const SETTINGS_KEYS = [
  "general",
  "hero",
  "contact",
  "hours",
  "socials",
  "about",
  "stats",
  "whyChooseUs",
  "facilities",
  "everyCourseIncludes",
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

/**
 * Admin tab metadata (docs/05 §4.13).
 *
 * The spec lists eight tabs ("General · Contact & hours · Social links · About ·
 * Stats · Why choose us · Facilities · SEO defaults") but the schema defines nine
 * independent keys. Contact/hours and facilities/every-course-includes are merged
 * into one tab here, and the SEO defaults live inside the General tab, so that
 * **exactly one form writes each key** — two tabs writing `general` would mean one
 * silently overwrites the other.
 */
export const SETTINGS_TABS = [
  {
    key: "general",
    label: "General",
    hint: "Name, tagline, description and the SEO defaults (site URL, logo, Twitter handle).",
  },
  {
    key: "hero",
    label: "Hero",
    hint: "Home page banner: eyebrow, heading, subtitle, buttons and the hero images.",
  },
  { key: "contact", label: "Contact", hint: "Phone, WhatsApp, e-mail, address and map." },
  { key: "hours", label: "Opening hours", hint: "One row per day or day range." },
  { key: "socials", label: "Social links", hint: "Shown in the footer and on the contact page." },
  { key: "about", label: "About", hint: "Story, mission, vision and the campus photo." },
  {
    key: "stats",
    label: "Stats",
    hint: "Home page counters. Unverified values must stay flagged until they are confirmed.",
  },
  { key: "whyChooseUs", label: "Why choose us", hint: "Home page highlights, with an icon each." },
  { key: "facilities", label: "Facilities", hint: "Bullet list on the about page." },
  {
    key: "everyCourseIncludes",
    label: "Every course includes",
    hint: "Shared benefits list shown on the course pages.",
  },
] as const satisfies readonly { key: SettingsKey; label: string; hint: string }[];

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

/**
 * Icon keys understood by `Footer.socialIconMap` and `WhyChooseUs.iconMap`.
 * Adding an icon to those maps means adding it here too, otherwise the admin
 * select cannot produce it.
 */
export const SOCIAL_ICON_KEYS = [
  "facebook",
  "instagram",
  "youtube",
  "linkedin",
  "whatsapp",
] as const;

export const WHY_ICON_KEYS = [
  "award",
  "monitor",
  "briefcase",
  "clock",
  "wallet",
  "checkCircle",
  "users",
] as const;

/**
 * Unverified copy is written as the literal word `PLACEHOLDER` across the static
 * content (team, gallery, blog), so it is the marker the admin warns about
 * (docs/04 §4.1 "Stats cannot be saved with placeholder text").
 */
export const PLACEHOLDER_PATTERN = /placeholder|\btbd\b|\btodo\b|to be (added|confirmed)|xxx/i;

/** `""` counts as placeholder too — an empty stat must never look published. */
export function isPlaceholderText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || PLACEHOLDER_PATTERN.test(trimmed);
}

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

const multilineText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long (max ${max} characters)`);

/**
 * `Media.id` reference: `""`, `null` and a missing field all mean "use the built-in
 * fallback image". Stored JSON round-trips `null`, so it has to be accepted on the
 * way in as well as the blank string the admin form sends.
 */
const mediaIdField = z
  .string()
  .trim()
  .max(64, "Invalid image reference")
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))
  .refine(
    (value) => value === null || cuidLike.safeParse(value).success,
    "Invalid image reference"
  );

/**
 * Absolute `http(s)` URL; a trailing slash is stripped so joins stay stable.
 *
 * `z.url()` also accepts `javascript:` and `data:`, and these values end up in
 * `href` attributes on the public pages, so the scheme is restricted here (this
 * is the stored-XSS boundary for the settings module).
 */
const absoluteUrl = (label: string) =>
  z
    .url(`${label} must be a valid URL`)
    .max(300, `${label} is too long`)
    .refine((value) => /^https?:\/\//i.test(value), `${label} must start with http:// or https://`)
    .transform((value) => value.replace(/\/+$/, ""));

/**
 * A site-internal path (`/courses`) or an absolute `http(s)` URL. Same
 * stored-XSS boundary as `absoluteUrl`: anything else (including `javascript:`)
 * is rejected before it can reach an `href`.
 */
const linkHref = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(300, `${label} is too long`)
    .refine(
      (value) => /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value),
      `${label} must be a site path starting with "/" or an http(s) URL`
    );

/** Optional link: an empty string means "no button / no link". */
const optionalLinkHref = (label: string) =>
  z
    .string()
    .trim()
    .max(300, `${label} is too long`)
    .refine(
      (value) => value === "" || /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value),
      `${label} must be a site path starting with "/" or an http(s) URL`
    )
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : ""));

/** Optional free text; missing or blank normalises to `""`. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters)`)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : ""));

/**
 * Accepts a real array (from the admin row editor) or a textarea's newline/comma
 * separated text (from the simple list tabs) and normalises both to a trimmed,
 * de-duplicated array.
 *
 * Blank lines and duplicates are dropped rather than rejected: a trailing newline
 * in a textarea is normal editing, and the seed data itself repeats nothing. The
 * list still has to end up with at least one entry.
 */
const textList = (label: string, itemMax: number, maxItems: number) =>
  z
    .union([z.array(z.string()), z.string()])
    .transform((value) => (Array.isArray(value) ? value : value.split(/[\n,]/)))
    .pipe(z.array(z.string().trim().max(itemMax, `${label} entry is too long (max ${itemMax} characters)`)))
    .transform((entries) =>
      [...new Set(entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
    )
    .pipe(
      z
        .array(z.string())
        .min(1, `Add at least one ${label}`)
        .max(maxItems, `Too many ${label} entries (max ${maxItems})`)
    );

const rowList = <T extends z.ZodType>(row: T, maxItems: number) =>
  z.array(row).min(1, "Add at least one row").max(maxItems, `Too many rows (max ${maxItems})`);

export const generalSchema = z.object({
  name: requiredText(120, "Site name"),
  shortName: requiredText(120, "Short name"),
  tagline: requiredText(200, "Tagline"),
  description: requiredText(400, "Site description"),
  siteUrl: absoluteUrl("Site URL"),
  logoMediaId: mediaIdField,
  twitterHandle: z
    .string()
    .trim()
    .max(60, "Twitter handle is too long")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : "")),
});

/**
 * Home page hero banner (docs/03 §4).
 *
 * `title` is plain text with two lightweight conventions the Hero component
 * understands: a newline starts a new line (`<br>`), and `**word**` marks the
 * gradient-highlighted phrase. The eyebrow uses the same `**word**` marker for
 * its emphasised word. Everything else is a plain string or a `Media.id`.
 */
export const heroSchema = z.object({
  eyebrow: requiredText(160, "Eyebrow"),
  title: multilineText(240, "Heading"),
  subtitle: multilineText(600, "Subtitle"),
  primaryCtaLabel: requiredText(60, "Primary button label"),
  primaryCtaHref: linkHref("Primary button link"),
  secondaryCtaLabel: optionalText(60, "Secondary button label"),
  secondaryCtaHref: optionalLinkHref("Secondary button link"),
  imageMediaId: mediaIdField,
  imageAlt: requiredText(160, "Hero image alt text"),
  popupMediaId: mediaIdField,
  popupAlt: optionalText(160, "Popup image alt text"),
});

export const contactSchema = z.object({
  phone: phoneSchema,
  whatsapp: phoneSchema,
  email: requiredEmailSchema,
  address: requiredText(300, "Address"),
  /**
   * A place query ("Kathmandu, Nepal"), not embeddable HTML. Storing markup in
   * the database would make every admin a stored-XSS author; the public page
   * builds the embed URL from this value instead.
   */
  mapQuery: requiredText(300, "Map location"),
  notifyEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Notification e-mail is too long")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Please enter a valid notification e-mail address"
    )
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : "")),
});

/** "Sunday – Friday" / "7:00 AM – 8:00 PM" — free text, exactly as today renders it. */
export const hoursSchema = rowList(
  z.object({
    day: requiredText(80, "Day"),
    time: requiredText(120, "Hours"),
  }),
  14
);

export const socialsSchema = rowList(
  z.object({
    name: requiredText(60, "Network name"),
    url: absoluteUrl("Profile URL"),
    icon: z.enum(SOCIAL_ICON_KEYS, {
      error: "Pick one of the supported icons",
    }),
  }),
  SOCIAL_ICON_KEYS.length * 3
);

export const aboutSchema = z.object({
  story: multilineText(4000, "Story"),
  mission: multilineText(2000, "Mission"),
  vision: multilineText(2000, "Vision"),
  campusMediaId: mediaIdField,
});

/**
 * Stats (docs/03 §4: "no placeholder values allowed to publish").
 *
 * `SiteSetting` has no status column, so the publish rule is enforced at write
 * time: a value that still reads as placeholder text cannot be saved as a
 * confirmed figure. Editors either type the real number or leave the row flagged
 * `isPlaceholder`, which is how the seeded unverified stats are stored and how the
 * public components already style them.
 */
export const statsSchema = z
  .array(
    z.object({
      label: requiredText(80, "Stat label"),
      value: requiredText(40, "Stat value"),
      isPlaceholder: z
        .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
        .transform((value) => value === true || value === "true" || value === "1" || value === "on")
        .default(false),
    })
  )
  .min(1, "Keep at least one stat")
  .max(12, "Too many stats (max 12)")
  .superRefine((stats, ctx) => {
    stats.forEach((stat, index) => {
      if (!stat.isPlaceholder && isPlaceholderText(stat.value)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "value"],
          message:
            "This still reads as a placeholder. Enter the confirmed figure or tick \"unverified\".",
        });
      }
    });
  });

export const whyChooseUsSchema = rowList(
  z.object({
    title: requiredText(120, "Title"),
    description: requiredText(400, "Description"),
    icon: z.enum(WHY_ICON_KEYS, { error: "Pick one of the supported icons" }),
  }),
  12
);

export const facilitiesSchema = textList("facility", 200, 30);

export const everyCourseIncludesSchema = textList("benefit", 120, 30);

export const SETTINGS_SCHEMAS = {
  general: generalSchema,
  hero: heroSchema,
  contact: contactSchema,
  hours: hoursSchema,
  socials: socialsSchema,
  about: aboutSchema,
  stats: statsSchema,
  whyChooseUs: whyChooseUsSchema,
  facilities: facilitiesSchema,
  everyCourseIncludes: everyCourseIncludesSchema,
} as const satisfies Record<SettingsKey, z.ZodType>;

/** The action validates `{ key, value }`; `value` is checked by the key's schema. */
export const settingsWriteSchema = z.object({
  key: z.enum(SETTINGS_KEYS),
  value: z.unknown(),
});

export type SettingsWriteInput = z.input<typeof settingsWriteSchema>;

export function parseSettingsValue(key: SettingsKey, value: unknown) {
  return (SETTINGS_SCHEMAS[key] as z.ZodType).safeParse(value) as
    | { success: true; data: unknown }
    | { success: false; error: z.ZodError };
}

export type GeneralSettings = z.output<typeof generalSchema>;
export type HeroSettings = z.output<typeof heroSchema>;
export type ContactSettings = z.output<typeof contactSchema>;
export type HoursSettings = z.output<typeof hoursSchema>;
export type SocialsSettings = z.output<typeof socialsSchema>;
export type AboutSettings = z.output<typeof aboutSchema>;
export type StatsSettings = z.output<typeof statsSchema>;
export type WhyChooseUsSettings = z.output<typeof whyChooseUsSchema>;
export type FacilitiesSettings = z.output<typeof facilitiesSchema>;
export type EveryCourseIncludesSettings = z.output<typeof everyCourseIncludesSchema>;

/** Select options for the two icon dropdowns. */
export const SOCIAL_ICON_OPTIONS = SOCIAL_ICON_KEYS.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const WHY_ICON_OPTIONS = WHY_ICON_KEYS.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

/** Home page headline fields are edited per-group, not per-key; shown for copy. */
export const SETTINGS_NOTES = {
  whyHeading: "Section headings on the public pages stay hard-coded for now (docs/05 §4.13).",
} as const;
