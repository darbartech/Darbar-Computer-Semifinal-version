import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { AuditLogsTable } from "@/components/admin/AuditLogsTable";
import { requirePermission } from "@/server/session";
import { adminListAuditLogs } from "@/server/dal/audit";
import { auditLogFilterSchema } from "@/lib/validators/audit";

export const metadata: Metadata = {
  title: "Audit Log",
  robots: { index: false, follow: false },
};

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("audit.view");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = auditLogFilterSchema.parse(raw);

  const result = await adminListAuditLogs(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Audit Log" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <ClipboardList className="size-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} record{result.total === 1 ? "" : "s"} in this view. Every write
            administrative action is recorded here — actor, timestamp, and a short summary.
          </p>
        </div>
      </div>

      <AuditLogsTable
        rows={result.rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          actorEmail: row.actorEmail,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          summary: row.summary,
        }))}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q,
          entity: filters.entity,
          action: filters.action,
          page: filters.page,
        }}
      />
    </div>
  );
}
