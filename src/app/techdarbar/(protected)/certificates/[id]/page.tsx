import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CertificateForm } from "@/components/admin/certificates/CertificateForm";
import { PreviewPanel } from "@/components/admin/certificates/PreviewPanel";
import { CertificateDetailPanel } from "@/components/admin/certificates/CertificateDetailPanel";
import { CertificateImmutableOverview } from "@/components/admin/certificates/CertificateImmutableOverview";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetCertificate, listActiveTemplates, listActiveSignatories } from "@/server/dal/certificates";
import { adminListCoursesSimple } from "@/server/dal/courses";

export const metadata: Metadata = {
  title: "Certificate",
  robots: { index: false, follow: false },
};

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("certificate.read");
  const { id } = await params;

  const certificate = await adminGetCertificate(id);
  if (!certificate) notFound();

  const [courses, templates, signatories] = await Promise.all([
    adminListCoursesSimple(),
    listActiveTemplates(),
    listActiveSignatories(),
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

  const templateOptions = templates.map((template) => ({
    value: template.id,
    label: `${template.name} · v${template.version}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Certificates", href: "/techdarbar/certificates" },
          { label: certificate.certificateNumber ?? certificate.id.slice(0, 8) },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Award className="size-7 text-primary" />
            {certificate.recipientName}
          </h1>
          <p className="text-sm text-neutral-600">
            {certificate.courseName}
          </p>
        </div>
        <Link
          href="/techdarbar/certificates"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to certificates
        </Link>
      </div>

      <CertificateDetailPanel
        certificate={certificate}
        signatoryOptions={signatories}
        canReview={can(user.role, "certificate.write")}
        canIssue={can(user.role, "certificate.issue")}
        canRevoke={can(user.role, "certificate.revoke")}
        canReissue={can(user.role, "certificate.reissue")}
        canRegeneratePdf={can(user.role, "certificate.regenerate_pdf")}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {certificate.status === "DRAFT" || certificate.status === "PENDING_ISSUE" ? (
            <CertificateForm
              certificate={certificate}
              courseOptions={courseOptions}
              templateOptions={templateOptions}
              canWrite={can(user.role, "certificate.write")}
            />
          ) : (
            <CertificateImmutableOverview certificate={certificate} />
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <PreviewPanel certificate={certificate} />
          </div>
        </div>
      </div>
    </div>
  );
}
