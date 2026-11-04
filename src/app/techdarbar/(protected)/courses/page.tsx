import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CoursesTable } from "@/components/admin/CoursesTable";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListCourses } from "@/server/dal/courses";
import { listActiveCategoryGroups } from "@/server/dal/categories";
import { courseFilterSchema } from "@/lib/validators/course";

export const metadata: Metadata = {
  title: "Courses",
  robots: { index: false, follow: false },
};

export default async function AdminCoursesPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Role check happens on the server. Hiding the nav item is cosmetic only.
  const user = await requirePermission("course.read");

  const sp = await searchParams;
  // Empty strings mean "no filter" so `?status=` cannot match nothing.
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = courseFilterSchema.parse(raw);

  const [result, groups] = await Promise.all([
    adminListCourses(filters),
    listActiveCategoryGroups(),
  ]);

  const categoryOptions = groups.flatMap((group) =>
    group.categories.map((category) => ({
      value: category.slug,
      label: `${group.label} · ${category.name}`,
    }))
  );

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Courses" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <BookOpen className="size-6 text-primary" />
            Courses
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} course{result.total === 1 ? "" : "s"} in this view. Saving a
            course publishes the change to the catalog immediately — archiving one
            makes its public page return 404.
          </p>
        </div>
        {can(user.role, "course.write") && (
          <Link href="/techdarbar/courses/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New course
          </Link>
        )}
      </div>

      <CoursesTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          status: filters.status ?? "",
          category: filters.category ?? "",
          featured: filters.featured,
        }}
        categoryOptions={categoryOptions}
        canWrite={can(user.role, "course.write")}
        canArchive={can(user.role, "course.archive")}
      />
    </div>
  );
}
