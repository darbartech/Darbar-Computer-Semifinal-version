import { Suspense } from "react";
import CoursesClient from "./CoursesClient";
import { buildMetadata } from "@/lib/seo";
import { listCategoryGroups, listPublishedCourses } from "@/server/dal/courses";
import { getSiteSettings } from "@/server/dal/settings";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "All Courses — Programming, Design, AI & More",
      path: "/courses",
      description:
        "Browse 37 hands-on computer courses across 15 career fields in Kathmandu. Flexible batches, installment plans, career support.",
    },
    await getSiteSettings()
  );
}

/**
 * The catalog and its filter groups are read through the DAL and handed to the
 * client component as props (docs/06 §3). The read is tagged `courses`, so an
 * admin save is visible on the next visit.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; level?: string; search?: string }>;
}) {
  const params = await searchParams;
  const [courses, categoryGroups, { everyCourseIncludes }] = await Promise.all([
    listPublishedCourses(),
    listCategoryGroups(),
    getSiteSettings(),
  ]);

  const initialFilters = {
    search: params.search ?? "",
    categoryGroup: params.category ?? "All",
    level: params.level ?? "All",
  };

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-neutral-500">Loading course catalog...</div>
        </div>
      }
    >
      <CoursesClient
        key={`${initialFilters.categoryGroup}|${initialFilters.level}|${initialFilters.search}`}
        courses={courses}
        categoryGroups={categoryGroups}
        everyCourseIncludes={everyCourseIncludes}
        initialFilters={initialFilters}
      />
    </Suspense>
  );
}
