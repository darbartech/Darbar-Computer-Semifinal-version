import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { can } from "@/server/permissions";
import { NOINDEX_METADATA } from "@/lib/seo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { getSiteSettings } from "@/server/dal/settings";
import { countSubmissionsAwaitingReview } from "@/server/dal/assignments";

// Every authenticated admin page, plus the dashboard, is noindex/no-follow
// (docs/08 §1). Declared on the layout so a new `/admin/*` page cannot forget it.
export const metadata: Metadata = {
  robots: NOINDEX_METADATA,
};

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const settings = await getSiteSettings();
  // Sidebar badge: links students handed in that no instructor has judged yet.
  const awaitingReview = can(user.role, "assignment.read")
    ? await countSubmissionsAwaitingReview()
    : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminSidebar
        role={user.role}
        siteName={settings.general.name}
        logoUrl={settings.general.logoUrl}
        awaitingReview={awaitingReview}
      />
      <div className="md:pl-64">
        <AdminTopbar user={user} />
        <main className="p-4 md:p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}
