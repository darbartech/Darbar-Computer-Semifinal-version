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
 *
 * This page reads nothing from the request. The old version awaited the query
 * string to seed the filter controls, which made every visit — filtered or not —
 * render on the server, and the filtering was never a server concern: the whole
 * catalog arrives in one read and `CoursesClient` narrows it. The client now
 * takes the filters from the URL after hydration, so `/courses` is static under
 * the public layout's `revalidate` and `?category=&level=&search=` is the same
 * document with the controls moved. Inbound links and the back button still land
 * on the right list.
 */
export default async function CoursesPage() {
  const [courses, categoryGroups, { everyCourseIncludes }] = await Promise.all([
    listPublishedCourses(),
    listCategoryGroups(),
    getSiteSettings(),
  ]);

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-neutral-500">Loading course catalog...</div>
        </div>
      }
    >
      <CoursesClient
        courses={courses}
        categoryGroups={categoryGroups}
        everyCourseIncludes={everyCourseIncludes}
      />
    </Suspense>
  );
}
