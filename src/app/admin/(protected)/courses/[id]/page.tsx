import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CourseForm } from "@/components/admin/CourseForm";
import { Badge } from "@/components/common/Badge";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetCourse } from "@/server/dal/courses";
import { listActiveCategoryGroups } from "@/server/dal/categories";
import { listRecentMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "Edit course",
  robots: { index: false, follow: false },
};

export default async function EditCoursePage({
  params,
}: {
  // Next.js 16: params is a Promise.
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("course.read");
  const { id } = await params;

  const course = await adminGetCourse(id);
  if (!course) notFound();

  const [groups, library] = await Promise.all([listActiveCategoryGroups(), listRecentMedia(48)]);
  const categories = groups.flatMap((group) =>
    group.categories.map((category) => ({
      id: category.id,
      label: `${group.label} · ${category.name}`,
    }))
  );

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Courses", href: "/admin/courses" },
          { label: course.title },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {course.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                course.status === "PUBLISHED"
                  ? "success"
                  : course.status === "ARCHIVED"
                    ? "destructive"
                    : "outline"
              }
            >
              {course.status === "PUBLISHED"
                ? "Published"
                : course.status === "ARCHIVED"
                  ? "Archived"
                  : "Draft"}
            </Badge>
            {course.isFeatured && <Badge variant="secondary">Featured #{course.featuredOrder}</Badge>}
            <span className="text-sm text-neutral-500">/courses/{course.slug}</span>
          </div>
        </div>
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to courses
        </Link>
      </div>

      <CourseForm
        course={course}
        categories={categories}
        library={library}
        canWrite={can(user.role, "course.write")}
      />
    </div>
  );
}
