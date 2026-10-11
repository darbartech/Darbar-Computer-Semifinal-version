import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CourseForm } from "@/components/admin/CourseForm";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { listActiveCategoryGroups } from "@/server/dal/categories";
import { listRecentMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "New course",
  robots: { index: false, follow: false },
};

export default async function NewCoursePage() {
  const user = await requirePermission("course.write");

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
          { label: "New course" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          New course
        </h1>
        <p className="text-sm text-neutral-600">
          Fill in the Basics tab first — the URL and category come from there. Nothing is
          public until you set the status to Published.
        </p>
      </div>

      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Back to courses
      </Link>

      <CourseForm
        categories={categories}
        library={library}
        canWrite={can(user.role, "course.write")}
      />
    </div>
  );
}
