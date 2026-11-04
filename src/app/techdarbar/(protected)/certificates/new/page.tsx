import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CertificateForm } from "@/components/admin/certificates/CertificateForm";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListCoursesSimple } from "@/server/dal/courses";
import { listActiveTemplates } from "@/server/dal/certificates";

export const metadata: Metadata = {
  title: "New certificate",
  robots: { index: false, follow: false },
};

export default async function NewCertificatePage() {
  const user = await requirePermission("certificate.write");

  const [courses, templates] = await Promise.all([
    adminListCoursesSimple(),
    listActiveTemplates(),
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
          { label: "New certificate" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          New certificate
        </h1>
        <p className="text-sm text-neutral-600">
          Start with a draft. Fill in the basics and modules, then Issue to assign a
          number and make the certificate verifiable.
        </p>
      </div>

      <Link
        href="/techdarbar/certificates"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Back to certificates
      </Link>

      <CertificateForm
        courseOptions={courseOptions}
        templateOptions={templateOptions}
        canWrite={can(user.role, "certificate.write")}
      />
    </div>
  );
}
