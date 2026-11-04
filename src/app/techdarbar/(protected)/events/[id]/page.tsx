import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { EventFormClient } from "@/components/admin/EventFormClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetEvent } from "@/server/dal/events";
import { listRecentMedia } from "@/server/dal/media";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "accent" | "success" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  CANCELLED: "destructive",
};

const CATEGORY_LABEL: Record<string, string> = {
  WORKSHOP: "Workshop",
  SEMINAR: "Seminar",
  OPEN_HOUSE: "Open House",
  CERTIFICATION: "Certification",
  OTHER: "Other",
};

export const metadata: Metadata = {
  title: "Edit event",
  robots: { index: false, follow: false },
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("events.write");
  const { id } = await params;

  const event = await adminGetEvent(id);
  if (!event) notFound();

  const library = await listRecentMedia(24);
  const canWrite = can(user.role, "events.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Events", href: "/techdarbar/events" },
          { label: event.title },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[event.status] ?? "outline"}>
              {STATUS_LABEL[event.status] ?? event.status}
            </Badge>
            <span className="text-sm text-neutral-500">
              /events/{event.slug}
            </span>
            {event.category && (
              <Badge variant="accent" className="text-[11px]">
                <BadgeCheck className="mr-1 size-3 inline" />
                {CATEGORY_LABEL[event.category] ?? event.category}
              </Badge>
            )}
          </div>
        </div>
        <Link
          href="/techdarbar/events"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to events
        </Link>
      </div>

      <EventFormClient event={event} library={library} canWrite={canWrite} />
    </div>
  );
}
