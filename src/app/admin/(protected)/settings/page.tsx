import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetSiteSettings } from "@/server/dal/settings";
import { listRecentMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "Site settings",
  robots: { index: false, follow: false },
};

/**
 * Site settings (docs/05 §4.13). Every public string on the site is reachable
 * from here: one tab per `SiteSetting.key`, each tab saving its own key.
 *
 * The read is uncached on purpose — an editor who saves a tab and reopens the
 * panel must see what they just wrote.
 */
export default async function AdminSettingsPage() {
  const user = await requirePermission("settings.read");

  const [{ settings, rows }, library] = await Promise.all([
    adminGetSiteSettings(),
    listRecentMedia(48),
  ]);

  const updatedAtByKey = new Map(rows.map((row) => [row.key, row.updatedAt]));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Site settings" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Settings className="size-6 text-primary" />
          Site settings
        </h1>
        <p className="text-sm text-neutral-600">
          These values replace the hard-coded contact details, opening hours, social
          links, about copy and SEO defaults that used to live in the source code.
          Saving a tab publishes that group immediately — the public pages are
          re-rendered on the next visit.
        </p>
      </div>

      <SettingsPanel
        settings={settings}
        updatedAtByKey={Object.fromEntries(
          [...updatedAtByKey.entries()].map(([key, value]) => [key, value.toISOString()])
        )}
        library={library}
        canWrite={can(user.role, "settings.write")}
      />
    </div>
  );
}
