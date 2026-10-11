import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { EventsTableClient } from "@/components/admin/EventsTableClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListEvents } from "@/server/dal/events";
import { eventFilterSchema } from "@/lib/validators/events";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("events.write");

  const sp = await searchParams;

  const raw = Object.fromEntries(
    Object.entries(sp).filter(
      ([, value]) => typeof value === "string" && value !== ""
    )
  );
  const filters = eventFilterSchema.parse(raw);

  const result = await adminListEvents(filters);
  const canWrite = can(user.role, "events.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Events" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Calendar className="size-6 text-primary" />
            Events
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} event{result.total === 1 ? "" : "s"} in this view.
            Published events appear on /events immediately.
          </p>
        </div>
        {canWrite && (
          <Link href="/admin/events/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New event
          </Link>
        )}
      </div>

      <EventsTableClient
        initialRows={result.rows}
        initialTotal={result.total}
        initialPage={result.page}
        initialPageCount={result.pageCount}
        initialFilters={{
          q: filters.q ?? "",
          status: filters.status ?? "",
          category: filters.category ?? "",
          page: result.page,
        }}
        canWrite={canWrite}
      />
    </div>
  );
}
