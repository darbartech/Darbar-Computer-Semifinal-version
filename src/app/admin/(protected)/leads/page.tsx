import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  adminListLeads,
  listLeadAssignees,
  listLeadCourseOptions,
} from "@/server/dal/leads";
import { leadFilterSchema } from "@/lib/validators/lead";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false, follow: false },
};

export default async function AdminLeadsPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Role check happens on the server. Hiding the nav item is cosmetic only.
  const user = await requirePermission("lead.read");

  const sp = await searchParams;
  // Empty strings mean "no filter": drop them so `?course=` cannot filter on an
  // empty slug and return nothing.
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = leadFilterSchema.parse(raw);

  const [result, assignees, courses] = await Promise.all([
    adminListLeads(filters, { userId: user.id, role: user.role }),
    listLeadAssignees(),
    listLeadCourseOptions(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Leads" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Users className="size-6 text-primary" />
          Leads
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} lead{result.total === 1 ? "" : "s"} in this view. Every status
          change, assignment and note is written to the activity timeline and the
          audit log.
        </p>
      </div>

      <LeadsTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        counts={result.counts}
        filters={filters}
        assignees={assignees}
        courses={courses}
        canDelete={can(user.role, "lead.delete")}
      />
    </div>
  );
}
