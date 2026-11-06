import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { BatchesManager } from "@/components/admin/BatchesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  adminListBatches,
  listBatchInstructors,
  listCoursesForBatchForm,
} from "@/server/dal/batches";
import { batchFilterSchema } from "@/lib/validators/batch";

export const metadata: Metadata = {
  title: "Batches",
  robots: { index: false, follow: false },
};

export default async function AdminBatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("batch.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = batchFilterSchema.parse(raw);

  const scope = { userId: user.id, role: user.role };
  const canWrite = can(user.role, "batch.write");
  const [result, courseRows, instructorRows] = await Promise.all([
    adminListBatches(
      {
        q: filters.q,
        courseId: filters.courseId,
        status: filters.status,
        page: filters.page,
      },
      scope
    ),
    listCoursesForBatchForm(),
    // Only the writer needs the teacher list; an instructor just reads their own.
    canWrite ? listBatchInstructors() : Promise.resolve([]),
  ]);

  const courseOptions = courseRows.map((course) => ({ value: course.id, label: course.title }));
  const instructorOptions = instructorRows.map((instructor) => ({
    value: instructor.id,
    // Accounts are created with a name; a blank one would render an empty option.
    label: instructor.name || "Unnamed instructor",
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Batches" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <CalendarDays className="size-6 text-primary" />
          Batches
        </h1>
        <p className="text-sm text-neutral-600">
          {canWrite
            ? `${result.total} batch${result.total === 1 ? "" : "es"} in this view. The instructor of record decides whose portal, roster and submissions a teacher can open.`
            : `${result.total} batch${result.total === 1 ? "" : "es"} you teach. Students, assignments and submissions elsewhere in the institute stay out of view.`}
        </p>
      </div>

      <BatchesManager
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
        instructorOptions={instructorOptions}
        canWrite={canWrite}
      />
    </div>
  );
}
