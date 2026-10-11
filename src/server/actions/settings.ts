"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { SETTINGS_TAGS, invalidate } from "@/server/revalidate";
import {
  adminGetSettingRow,
  upsertSiteSetting,
  type SiteSettingJson,
} from "@/server/dal/settings";
import { mediaExists } from "@/server/dal/courses";
import {
  SETTINGS_TABS,
  parseSettingsValue,
  settingsWriteSchema,
  type SettingsKey,
} from "@/lib/validators/settings";

/**
 * Site settings Server Action (docs/06 §7, docs/05 §4.13).
 *
 * Same order as every other write in this codebase: permission → Zod
 * `safeParse` → DAL write → `audit()` → `invalidate(tags)`.
 *
 * One action handles all ten tabs: the tab decides the `key`, and the key picks
 * the schema, so a tab can never write another tab's group.
 */
export type SettingsActionResult =
  | { ok: true; data: { key: SettingsKey; updatedAt: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";

/** Keys that reference `Media` rows, and the fields that hold the ids. */
const MEDIA_FIELDS: Partial<Record<SettingsKey, readonly string[]>> = {
  general: ["logoMediaId"],
  hero: ["imageMediaId", "popupMediaId"],
  about: ["campusMediaId"],
};

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function tabLabel(key: SettingsKey): string {
  return SETTINGS_TABS.find((tab) => tab.key === key)?.label ?? key;
}

async function assertMediaExists(
  key: SettingsKey,
  value: unknown
): Promise<SettingsActionResult | null> {
  const fields = MEDIA_FIELDS[key];
  if (!fields) return null;
  for (const field of fields) {
    const mediaId = (value as Record<string, unknown> | null)?.[field];
    if (typeof mediaId !== "string" || !mediaId) continue;
    if (await mediaExists(mediaId)) continue;
    return {
      ok: false,
      error: "That image was not found in the media library",
      fieldErrors: { [field]: ["Pick an image from the media library"] },
    };
  }
  return null;
}

export async function saveSetting(input: unknown): Promise<SettingsActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("settings.write");
    actor = { id: user.id, email: user.email };

    const parsedInput = settingsWriteSchema.safeParse(input);
    if (!parsedInput.success) return { ok: false, error: "Invalid request" };

    const { key, value } = parsedInput.data;

    // The key's own schema (docs/03 §4 shapes), including the rule that a stat
    // still reading as placeholder text cannot be saved as confirmed.
    const parsed = parseSettingsValue(key, value);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      };
    }

    const mediaError = await assertMediaExists(key, parsed.data);
    if (mediaError) return mediaError;

    const before = await adminGetSettingRow(key);
    const saved = await upsertSiteSetting(key, parsed.data as SiteSettingJson, user.id);

    await audit({
      actor,
      action: before ? "settings.update" : "settings.create",
      entity: "SiteSetting",
      entityId: key,
      summary: `${before ? "Updated" : "Created"} ${tabLabel(key)} settings`,
      // Deliberately no values: `contact` and `general` hold an e-mail address
      // and a phone number, and audit rows must not duplicate personal data
      // (docs/08 §1).
      meta: { key, firstWrite: before === null },
    });

    invalidate(...SETTINGS_TAGS);

    return { ok: true, data: { key, updatedAt: saved.updatedAt.toISOString() } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error("[saveSetting]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}
