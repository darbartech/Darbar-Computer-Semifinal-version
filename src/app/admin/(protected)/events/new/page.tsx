import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { EventFormClient } from "@/components/admin/EventFormClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { listRecentMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "New event",
  robots: { index: false, follow: false },
};

export default async function NewEventPage() {
  const user = await requirePermission("events.write");
  const library = await listRecentMedia(24);
  const canWrite = can(user.role, "events.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Events", href: "/admin/events" },
          { label: "New event" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          New event
        </h1>
        <p className="text-sm text-neutral-600">
          Fill in the title and date first — the URL is auto-generated from the
          title. Nothing is public until you set the status to Published.
        </p>
      </div>

      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Back to events
      </Link>

      <EventFormClient library={library} canWrite={canWrite} />
    </div>
  );
}
