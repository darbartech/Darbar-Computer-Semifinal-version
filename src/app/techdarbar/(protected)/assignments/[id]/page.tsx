import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentSubmissions } from "@/components/admin/AssignmentSubmissions";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetAssignmentDetail } from "@/server/dal/assignments";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Assignment submissions",
  robots: { index: false, follow: false },
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">{value || "—"}</dd>
    </div>
  );
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  PUBLISHED: "success",
  DRAFT: "warning",
  ARCHIVED: "outline",
};

export default async function AdminAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("assignment.read");
  const { id } = await params;
  const assignment = await adminGetAssignmentDetail(id);
  if (!assignment) notFound();

  const submitted = assignment.rows.filter((row) => row.submission).length;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Assignments", href: "/techdarbar/assignments" },
          { label: assignment.title },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <ClipboardList className="size-6 text-primary" />
            {assignment.title}
          </h1>
          <p className="text-sm text-neutral-600">
            {submitted} of {assignment.rows.length} assigned student
            {assignment.rows.length === 1 ? "" : "s"} handed in a link.
          </p>
        </div>
        <Link href="/techdarbar/assignments">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back to assignments
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Course" value={assignment.courseTitle} />
            <Field
              label="Due date"
              value={assignment.dueDate ? formatDate(assignment.dueDate) : null}
            />
            <Field label="Created by" value={assignment.createdByName} />
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[assignment.status] ?? "outline"}>
              {assignment.status.toLowerCase()}
            </Badge>
            <span className="text-xs text-neutral-600">
              Only the ticked students see this task. Edit the assignment to add or remove them.
            </span>
          </div>
          {assignment.instructions && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Instructions
              </dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-neutral-800">
                {assignment.instructions}
              </dd>
            </div>
          )}
        </CardContent>
      </Card>

      <AssignmentSubmissions
        assignmentId={assignment.id}
        rows={assignment.rows}
        canWrite={can(user.role, "assignment.write")}
      />
    </div>
  );
}
