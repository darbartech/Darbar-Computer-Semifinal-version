import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { TestimonialsManager } from "@/components/admin/TestimonialsManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListTestimonials } from "@/server/dal/testimonials";
import { listPublishedCourseOptions } from "@/server/dal/courses";
import { listRecentMedia } from "@/server/dal/media";
import { testimonialFilterSchema } from "@/lib/validators/testimonials";

export const metadata: Metadata = {
  title: "Testimonials",
  robots: { index: false, follow: false },
};

export default async function AdminTestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("testimonials.write");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = testimonialFilterSchema.parse(raw);

  const [result, courseRows, library] = await Promise.all([
    adminListTestimonials({ q: filters.q, isPublished: filters.isPublished, page: filters.page }),
    listPublishedCourseOptions(),
    listRecentMedia(),
  ]);

  const courseOptions = courseRows.map((course) => ({
    value: course.id,
    label: course.title,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Testimonials" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <MessageSquareQuote className="size-6 text-primary" />
          Testimonials
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} testimonial{result.total === 1 ? "" : "s"} in this view.
          Publishing a testimonial makes it visible on the home page carousel and
          course pages immediately.
        </p>
      </div>

      <TestimonialsManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          isPublished: filters.isPublished ?? "",
        }}
        courseOptions={courseOptions}
        library={library}
        canWrite={can(user.role, "testimonials.write")}
        canDelete={can(user.role, "testimonials.delete")}
      />
    </div>
  );
}
