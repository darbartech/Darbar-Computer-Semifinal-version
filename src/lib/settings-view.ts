import {
  HERO_IMAGE_FALLBACK,
  HERO_POPUP_IMAGE_FALLBACK,
  PLACEHOLDER_CAMPUS_IMAGE,
  SETTING_DEFAULTS,
  type SettingDefaults,
} from "../../prisma/seed-data/site-settings";
import {
  PLACEHOLDER_PATTERN,
  SETTINGS_SCHEMAS,
  type AboutSettings,
  type ContactSettings,
  type EveryCourseIncludesSettings,
  type FacilitiesSettings,
  type GeneralSettings,
  type HeroSettings,
  type HoursSettings,
  type SettingsKey,
  type SocialsSettings,
  type StatsSettings,
  type WhyChooseUsSettings,
} from "@/lib/validators/settings";

/**
 * Row → view mapper for the `SiteSetting` module (docs/06 §5).
 *
 * Deliberately free of Prisma, `db` and `server-only` so it can be unit tested
 * and reused by the DAL, the admin page and `scripts/verify-seed.ts`. The DAL owns
 * the query; this module owns the shape the public pages consume.
 *
 * Layering, lowest priority first (docs/07 §1: "env overrides become fallbacks
 * only"):
 *
 *   `SETTING_DEFAULTS` literals → `NEXT_PUBLIC_*` env overrides → the DB row
 *
 * A row that fails its Zod schema is treated as absent (and reported through
 * `onInvalid`), because one bad JSON blob must never take the whole site down.
 */

/** The minimum a `SiteSetting` read has to provide. */
export type SettingRow = { key: string; value: unknown };

/** `Media.id` → `Media.url`, for the settings keys that hold an image id. */
export type SettingsMediaUrls = Record<string, string>;

export type SettingsEnv = Record<string, string | undefined>;

export type SiteSettingsView = {
  general: GeneralSettings & { logoUrl: string | null };
  hero: HeroSettings & { imageUrl: string; popupImageUrl: string };
  contact: ContactSettings & {
    telHref: string;
    mailHref: string;
    mapsHref: string;
    mapEmbedUrl: string;
    whatsappNumber: string;
    whatsappHref: string;
    whatsappMessage: string;
    whatsappDisplay: string;
  };
  hours: HoursSettings;
  socials: SocialsSettings;
  about: AboutSettings & { campusImageUrl: string };
  stats: StatsSettings;
  whyChooseUs: WhyChooseUsSettings;
  facilities: FacilitiesSettings;
  everyCourseIncludes: EveryCourseIncludesSettings;
};

/**
 * Env variables that still win when a key has no row yet (docs/07 §1). Once a
 * row exists the database is the source of truth.
 */
const ENV_FALLBACKS = {
  general: { siteUrl: "NEXT_PUBLIC_SITE_URL" },
  contact: {
    phone: "NEXT_PUBLIC_CONTACT_PHONE",
    email: "NEXT_PUBLIC_CONTACT_EMAIL",
    address: "NEXT_PUBLIC_ADDRESS",
  },
} as const satisfies Partial<Record<SettingsKey, Record<string, string>>>;

function envOverrides(env: SettingsEnv): Partial<Record<SettingsKey, Record<string, unknown>>> {
  const result: Partial<Record<SettingsKey, Record<string, unknown>>> = {};
  for (const [key, fields] of Object.entries(ENV_FALLBACKS) as [
    keyof typeof ENV_FALLBACKS,
    Record<string, string>,
  ][]) {
    const patch: Record<string, unknown> = {};
    for (const [field, variable] of Object.entries(fields)) {
      const value = env[variable]?.trim();
      if (value) patch[field] = value;
    }
    if (Object.keys(patch).length > 0) result[key] = patch;
  }
  return result;
}

/** `+977-9760808629` → `tel:+9779760808629`. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

/** Digits only, leading `+` removed, as `wa.me` expects. */
export function whatsappDigits(whatsapp: string, fallbackPhone: string): string {
  const source = whatsapp.trim() || fallbackPhone;
  return source.replace(/[^0-9+]/g, "").replace(/^\+/, "");
}

export function mapsHref(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * The campus map used to be a hand-written `<iframe>` string in
 * `instituteInfo.contact.mapEmbed` and injected with
 * `dangerouslySetInnerHTML`. Storing markup in a `SiteSetting` would turn every
 * admin into a stored-XSS author, so the settings key holds the place query and
 * the URL is derived here (docs/03 §4: `mapQuery`).
 */
export function mapEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

/** Same wording the static `WhatsAppButton` sent, now using the live site name. */
export function whatsappMessage(siteName: string): string {
  return `Hi ${siteName}! I'm interested in learning more about your courses. Can you help me?`;
}

/** Mirrors the old `includes("PLACEHOLDER")` check, generalised. */
export function isPlaceholderNumber(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

export function resolveSiteSettings(
  rows: readonly SettingRow[],
  mediaUrls: SettingsMediaUrls = {},
  env: SettingsEnv = {},
  defaults: SettingDefaults = SETTING_DEFAULTS,
  onInvalid?: (key: string, error: unknown) => void
): SiteSettingsView {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const envPatch = envOverrides(env);
  const invalid: string[] = [];

  /** DB row → validated data → env fallback → default. */
  function pick<K extends SettingsKey>(key: K): SettingDefaults[K] {
    const raw = byKey.get(key);
    if (raw !== undefined) {
      const parsed = (SETTINGS_SCHEMAS[key] as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } }).safeParse(
        raw
      );
      if (parsed.success) return parsed.data as SettingDefaults[K];
      invalid.push(key);
      onInvalid?.(key, parsed.error);
    }
    const patched = envPatch[key] as Partial<SettingDefaults[K]> | undefined;
    return patched
      ? ({ ...defaults[key], ...patched } as SettingDefaults[K])
      : defaults[key];
  }

  const general = pick("general");
  const hero = pick("hero");
  const contact = pick("contact");
  const about = pick("about");
  const whatsappNumber = whatsappDigits(contact.whatsapp, contact.phone);

  return {
    general: {
      ...general,
      logoUrl: general.logoMediaId ? (mediaUrls[general.logoMediaId] ?? null) : null,
    },
    hero: {
      ...hero,
      imageUrl: hero.imageMediaId
        ? (mediaUrls[hero.imageMediaId] ?? HERO_IMAGE_FALLBACK)
        : HERO_IMAGE_FALLBACK,
      popupImageUrl: hero.popupMediaId
        ? (mediaUrls[hero.popupMediaId] ?? HERO_POPUP_IMAGE_FALLBACK)
        : HERO_POPUP_IMAGE_FALLBACK,
    },
    contact: {
      ...contact,
      telHref: telHref(contact.phone),
      mailHref: `mailto:${contact.email}`,
      mapsHref: mapsHref(contact.mapQuery || contact.address),
      mapEmbedUrl: mapEmbedUrl(contact.mapQuery || contact.address),
      whatsappNumber,
      whatsappHref: `https://wa.me/${whatsappNumber}`,
      whatsappMessage: whatsappMessage(general.name),
      // A placeholder number must not be published as a real phone number.
      whatsappDisplay: isPlaceholderNumber(contact.whatsapp) ? "Chat on WhatsApp" : contact.whatsapp,
    },
    hours: pick("hours"),
    socials: pick("socials"),
    about: {
      ...about,
      campusImageUrl: about.campusMediaId
        ? (mediaUrls[about.campusMediaId] ?? PLACEHOLDER_CAMPUS_IMAGE)
        : PLACEHOLDER_CAMPUS_IMAGE,
    },
    stats: pick("stats"),
    whyChooseUs: pick("whyChooseUs"),
    facilities: pick("facilities"),
    everyCourseIncludes: pick("everyCourseIncludes"),
  };
}
