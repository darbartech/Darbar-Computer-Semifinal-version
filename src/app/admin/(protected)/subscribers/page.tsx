import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { SubscribersTable } from "@/components/admin/SubscribersTable";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListSubscribers } from "@/server/dal/newsletter";
import { subscriberFilterSchema } from "@/lib/validators/subscribers";

export const metadata: Metadata = {
  title: "Subscribers",
  robots: { index: false, follow: false },
};

export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("subscriber.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = subscriberFilterSchema.parse(raw);

  const result = await adminListSubscribers(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Subscribers" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Users className="size-6 text-primary" />
            Subscribers
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} subscriber{result.total === 1 ? "" : "s"} in this view. Newsletter
            subscriptions are double opt-in via the site footer.
          </p>
        </div>
      </div>

      <SubscribersTable
        rows={result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          source: row.source,
          status: row.status,
          createdAt: row.createdAt,
          unsubscribedAt: row.unsubscribedAt,
        }))}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q,
          status: filters.status,
          page: filters.page,
        }}
        canUpdate={can(user.role, "subscriber.update")}
      />
    </div>
  );
}
