import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { LeadDetailPanel } from "@/components/admin/LeadDetailPanel";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  findDuplicateLeads,
  getLeadDetail,
  listLeadAssignees,
} from "@/server/dal/leads";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Lead",
  robots: { index: false, follow: false },
};

export default async function AdminLeadDetailPage({
  params,
}: {
  // Next.js 16: params is a Promise.
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("lead.read");
  const { id } = await params;

  // Scoping happens in the DAL query, so a counselor asking for someone else's
  // lead gets the same 404 as a missing one.
  const lead = await getLeadDetail(id, { userId: user.id, role: user.role });
  if (!lead) notFound();

  const [assignees, duplicates] = await Promise.all([
    listLeadAssignees(),
    findDuplicateLeads(lead.id, lead.phone),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Leads", href: "/techdarbar/leads" },
          { label: lead.fullName },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {lead.fullName}
          </h1>
          <p className="text-sm text-neutral-600">
            Lead created {formatDateTime(lead.createdAt)} · last updated{" "}
            {formatDateTime(lead.updatedAt)}
            {lead.assigneeName ? ` · owned by ${lead.assigneeName}` : " · unassigned"}
          </p>
        </div>
        <Link href="/techdarbar/leads" className="group/btn">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4 transition-transform duration-200 group-hover/btn:-translate-x-0.5" />
            Back to leads
          </Button>
        </Link>
      </div>

      <LeadDetailPanel
        lead={lead}
        assignees={assignees}
        duplicates={duplicates}
        canDelete={can(user.role, "lead.delete")}
      />
    </div>
  );
}
