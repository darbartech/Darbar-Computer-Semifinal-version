import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { SETTINGS_TAGS } from "../revalidate";
import { SETTING_DEFAULTS } from "../../../prisma/seed-data/site-settings";
import {
  resolveSiteSettings,
  type SettingRow,
  type SettingsMediaUrls,
  type SiteSettingsView,
} from "@/lib/settings-view";
import type { SettingsKey } from "@/lib/validators/settings";

/**
 * Site settings data access (docs/06 §3, docs/04 §4.1).
 *
 * One table holds ten JSON blobs, so every read is a single `findMany` of the
 * whole table — there is no point in caching per key, and the admin screen wants
 * all of them at once. Validation, fallback layering and URL derivation live in
 * `@/lib/settings-view`; this file only talks to the database.
 */

export type SiteSettingJson = Prisma.InputJsonValue;

export type SettingRowMeta = {
  key: string;
  updatedAt: Date;
  updatedById: string | null;
};

export type AdminSiteSettings = {
  settings: SiteSettingsView;
  /** Which keys actually have a row, so the admin can show "not set up yet". */
  rows: SettingRowMeta[];
};

const select = { key: true, value: true, updatedAt: true, updatedById: true } as const;

async function readRows() {
  return db.siteSetting.findMany({ select, orderBy: { key: "asc" } });
}

async function mediaUrlsFor(rows: readonly SettingRow[]): Promise<SettingsMediaUrls> {
  const ids = new Set<string>();
  for (const row of rows) {
    const value = row.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Any field named `*MediaId` is a `Media.id`; the list keys are arrays so
      // are skipped by the `!Array.isArray` guard above.
      for (const [field, id] of Object.entries(value)) {
        if (field.endsWith("MediaId") && typeof id === "string" && id) ids.add(id);
      }
    }
  }
  if (ids.size === 0) return {};

  const media = await db.media.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, url: true },
  });
  return Object.fromEntries(media.map((row) => [row.id, row.url]));
}

/**
 * A settings blob can contain an e-mail address or a phone number, so a bad row
 * is reported by key and issue path only — never the value (docs/08 §1).
 */
function reportInvalidRow(key: string, error: unknown) {
  const issues =
    error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
      ? error.issues.map((issue: { path?: unknown[] }) => issue.path?.join(".")).filter(Boolean)
      : [];
  console.warn("[siteSettings] falling back to defaults", { key, issues });
}

/* ────────────────────────────── public read (cached) ────────────────────────────── */

/**
 * The one read every public surface uses: header, footer, WhatsApp button,
 * contact, about, home stats, course "includes" list, SEO defaults and JSON-LD.
 *
 * `NEXT_PUBLIC_*` env variables are passed as the fallback layer (docs/07 §1), so
 * the site still renders if the settings table is empty — the `settings` tag is
 * invalidated on every save.
 */
export const getSiteSettings = cached(
  SETTINGS_TAGS,
  async (): Promise<SiteSettingsView> => {
    const rows = await readRows();
    const mediaUrls = await mediaUrlsFor(rows);
    return resolveSiteSettings(
      rows,
      mediaUrls,
      process.env,
      SETTING_DEFAULTS,
      reportInvalidRow
    );
  }
);

/* ────────────────────────────── admin reads (uncached) ───────────────────────────── */

/**
 * Admin reads are never cached (docs/06 §3): an editor who saves one tab and
 * reopens the panel must see the value they just saved.
 */
export async function adminGetSiteSettings(): Promise<AdminSiteSettings> {
  const rows = await readRows();
  const mediaUrls = await mediaUrlsFor(rows);
  return {
    settings: resolveSiteSettings(rows, mediaUrls, process.env, SETTING_DEFAULTS, reportInvalidRow),
    rows: rows.map((row) => ({
      key: row.key,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    })),
  };
}

/** Stored row for one key; used by the action to detect a first-time write. */
export async function adminGetSettingRow(
  key: SettingsKey
): Promise<{ key: string; value: Prisma.JsonValue; updatedAt: Date } | null> {
  return db.siteSetting.findUnique({ where: { key }, select: { key: true, value: true, updatedAt: true } });
}

/* ────────────────────────────────── writes ────────────────────────────────── */

/**
 * Upsert one key (docs/05 §4.13: each tab writes exactly its own group). The
 * value has already been through the key's Zod schema in the action.
 */
export async function upsertSiteSetting(
  key: SettingsKey,
  value: SiteSettingJson,
  userId: string | null
): Promise<SettingRowMeta> {
  const row = await db.siteSetting.upsert({
    where: { key },
    update: { value, updatedById: userId },
    create: { key, value, updatedById: userId },
    select: { key: true, updatedAt: true, updatedById: true },
  });
  return row;
}
