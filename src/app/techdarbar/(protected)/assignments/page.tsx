import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { AssignmentsManager } from "@/components/admin/AssignmentsManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListAssignments, listCoursesForAssignmentForm } from "@/server/dal/assignments";
import { assignmentFilterSchema } from "@/lib/validators/assignments";

export const metadata: Metadata = {
  title: "Assignments",
  robots: { index: false, follow: false },
};

export default async function AdminAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("assignment.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = assignmentFilterSchema.parse(raw);

  const scope = { userId: user.id, role: user.role };
  const [result, courseRows] = await Promise.all([
    adminListAssignments(
      {
        q: filters.q,
        courseId: filters.courseId,
        status: filters.status,
        page: filters.page,
      },
      scope
    ),
    listCoursesForAssignmentForm(),
  ]);

  const courseOptions = courseRows.map((course) => ({
    value: course.id,
    label: course.title,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Assignments" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <ClipboardList className="size-6 text-primary" />
          Assignments
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} assignment{result.total === 1 ? "" : "s"} in this view. A published
          assignment appears in the student portal for everyone enrolled in its course; students
          answer with a single link.
        </p>
      </div>

      <AssignmentsManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          courseId: filters.courseId ?? "",
          status: filters.status ?? "",
        }}
        courseOptions={courseOptions}
        canWrite={can(user.role, "assignment.write")}
      />
    </div>
  );
}
