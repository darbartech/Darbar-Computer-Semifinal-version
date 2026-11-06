import { Container } from "@/components/common/Container";
import { NOINDEX_METADATA } from "@/lib/seo";
import { requireStudentProfile } from "@/server/student-session";
import { LogoutButton } from "@/components/student/LogoutButton";
import { StudentPortalNav } from "@/components/student/StudentPortalNav";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Award, Download, FileText, ShieldCheck, CalendarClock } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { listStudentCertificates } from "@/server/dal/students";
import { cn } from "@/lib/utils";

export const metadata = {
  robots: NOINDEX_METADATA,
};

export default async function StudentCertificatesPage() {
  const { profile } = await requireStudentProfile();
  const certificates = await listStudentCertificates({ id: profile.id });

  const issued = certificates.filter((c) => c.status === "ISSUED");
  const pending = certificates.filter((c) => c.status !== "ISSUED");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">My certificates</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Certificates you have earned. Download the PDF or verify it online.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Award className="size-4" />
          {issued.length} issued · {pending.length} other
        </div>
      </div>

      {issued.length === 0 && pending.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Award className="mx-auto size-10 text-neutral-300" />
            <p className="mt-4 font-medium text-neutral-900">No certificates yet</p>
            <p className="text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              When a certificate is issued to your student account or student code, it will appear here.
            </p>
            <Link
              href="/courses"
              className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
            >
              Browse courses
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {issued.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-neutral-900">Issued</h3>
          {issued.map((cert) => (
            <Card key={cert.id} className="overflow-hidden">
              <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 truncate">{cert.courseName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    {cert.certificateNumber && (
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="size-3.5" />
                        {cert.certificateNumber}
                      </span>
                    )}
                    {cert.issueDate && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        Issued {formatDate(cert.issueDate)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5" />
                      Verified online
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/student/certificates/${cert.id}/download`}
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Download className="size-4" />
                    Download PDF
                  </a>
                  {cert.verificationToken && (
                    <Link
                      href={`/verify/${cert.verificationToken}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Verify
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-neutral-900">Pending / Other</h3>
          {pending.map((cert) => (
            <Card key={cert.id}>
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 truncate">{cert.courseName}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 capitalize">
                    Status: {cert.status.toLowerCase()}
                  </p>
                </div>
                <Link href={`/verify/${cert.verificationToken}`} className="text-sm font-medium text-primary hover:underline">
                  Check status
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
