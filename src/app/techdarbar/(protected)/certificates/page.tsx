import type { Metadata } from "next";
import Link from "next/link";
import { Award, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { CertificateListTable } from "@/components/admin/certificates/CertificateListTable";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListCertificates, countCertificatesByStatus } from "@/server/dal/certificates";
import { adminListCoursesSimple } from "@/server/dal/courses";
import { certificateFilterSchema } from "@/lib/validators/certificates";
import type { CertificateStatusValue } from "@/server/types/certificates";

export const metadata: Metadata = {
  title: "Certificates",
  robots: { index: false, follow: false },
};

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("certificate.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const parsed = certificateFilterSchema.safeParse(raw);
  const filters = parsed.success
    ? parsed.data
    : { q: undefined, status: undefined, courseId: undefined, page: 1 };

  const [result, courses, counts] = await Promise.all([
    adminListCertificates(filters),
    adminListCoursesSimple(),
    countCertificatesByStatus(),
  ]);

  const courseOptions = courses.map((course) => ({
    value: course.id,
    label: course.title,
    durationWeeks: course.durationWeeks,
    skillsGained: course.skillsGained,
    softwareTools: course.softwareTools,
    portfolioProjects: course.portfolioProjects,
    learningObjectives: course.learningObjectives,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Certificates" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Award className="size-6 text-primary" />
            Certificates
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} certificate{result.total === 1 ? "" : "s"}. Drafts are editable —
            once issued a certificate becomes an immutable permanent record.
          </p>
        </div>
        {can(user.role, "certificate.write") && (
          <Link
            href="/techdarbar/certificates/new"
            className={buttonVariants()}
          >
            <Plus className="size-4" />
            New certificate
          </Link>
        )}
      </div>

      <CertificateListTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          status: filters.status ?? "",
          courseId: filters.courseId ?? "",
        }}
        courseOptions={courseOptions}
        counts={counts as Record<CertificateStatusValue, number>}
        canDelete={can(user.role, "certificate.delete")}
      />
    </div>
  );
}
