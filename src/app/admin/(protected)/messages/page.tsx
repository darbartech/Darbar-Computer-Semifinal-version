import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { MessagesTable } from "@/components/admin/MessagesTable";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListMessages } from "@/server/dal/messages";
import { messageFilterSchema } from "@/lib/validators/messages";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("contact.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = messageFilterSchema.parse(raw);

  const result = await adminListMessages(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Messages" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Mail className="size-6 text-primary" />
            Messages
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} message{result.total === 1 ? "" : "s"} in this view. Mark as read or
            replied after handling, and archive or delete when done.
          </p>
        </div>
      </div>

      <MessagesTable
        rows={result.rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          name: row.name,
          email: row.email,
          subject: row.subject,
          status: row.status,
        }))}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q,
          status: filters.status,
          page: filters.page,
        }}
        canUpdate={can(user.role, "contact.update")}
      />
    </div>
  );
}
