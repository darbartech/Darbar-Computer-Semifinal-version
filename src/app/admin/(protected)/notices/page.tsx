import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { NoticesManager } from "@/components/admin/NoticesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListNotices } from "@/server/dal/notices";
import { listRecentMedia } from "@/server/dal/media";
import { noticeFilterSchema } from "@/lib/validators/notices";

export const metadata: Metadata = {
  title: "Notices",
  robots: { index: false, follow: false },
};

export default async function AdminNoticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("notice.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = noticeFilterSchema.parse(raw);

  const [result, library] = await Promise.all([
    adminListNotices({
      q: filters.q,
      status: filters.status,
      type: filters.type,
      page: filters.page,
    }),
    listRecentMedia(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Notices" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Megaphone className="size-6 text-primary" />
          Notices
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} notice{result.total === 1 ? "" : "s"} in this view. A published notice
          pops up for every visitor, on every page of the site, until its Upto date passes.
        </p>
      </div>

      <NoticesManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          status: filters.status ?? "",
          type: filters.type ?? "",
        }}
        library={library}
        canWrite={can(user.role, "notice.write")}
      />
    </div>
  );
}
