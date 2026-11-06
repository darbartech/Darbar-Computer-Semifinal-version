import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/server/session";
import { can } from "@/server/permissions";
import { NOINDEX_METADATA } from "@/lib/seo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { getSiteSettings } from "@/server/dal/settings";
import { countSubmissionsAwaitingReview } from "@/server/dal/assignments";
import { countOpenDues } from "@/server/dal/fees";

// Every authenticated admin page, plus the dashboard, is noindex/no-follow
// (docs/08 §1). Declared on the layout so a new `/techdarbar/*` page cannot forget it.
export const metadata: Metadata = {
  robots: NOINDEX_METADATA,
};

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The chrome itself must stay reachable while an account is being enrolled in
  // two-factor, so this uses the ungated primitive; every page inside it gates.
  const user = await requireSessionUser();
  // Student accounts share the session store but have no staff permission.
  // Without this gate they reach admin pages and hit a raw FORBIDDEN error.
  if (!can(user.role, "dashboard.view")) redirect("/techdarbar/login");
  const settings = await getSiteSettings();
  // Sidebar badge: links students handed in that no instructor has judged yet.
  const awaitingReview = can(user.role, "assignment.read")
    ? await countSubmissionsAwaitingReview({ userId: user.id, role: user.role })
    : 0;
  // Sidebar badge: bills still unpaid (docs 05 §5 — the accountant opens on Dues).
  const openDues = can(user.role, "fee.read") ? await countOpenDues() : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* The same skip link the public layout uses: the sidebar is two dozen tabs
          deep and the page an admin came for is behind all of it (docs/08 §UX). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
      >
        Skip to content
      </a>
      <AdminSidebar
        role={user.role}
        siteName={settings.general.name}
        logoUrl={settings.general.logoUrl}
        awaitingReview={awaitingReview}
        openDues={openDues}
      />
      <div className="md:pl-64">
        <AdminTopbar user={user} />
        <main id="main-content" className="p-4 md:p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}
