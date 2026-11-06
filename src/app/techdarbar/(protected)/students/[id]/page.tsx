import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StudentDataControls } from "@/components/admin/StudentDataControls";
import {
  EnrollmentDecisionList,
  StudentReviewControls,
} from "@/components/admin/StudentReviewControls";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { getStudentForAdmin } from "@/server/dal/students";
import { seesStudentPii } from "@/server/dal/scope";
import { listSeatOptionsForCourses } from "@/server/dal/batches";
import { getStudentFeeSummaries, listBillableEnrollments } from "@/server/dal/fees";
import { StudentFeesCard } from "@/components/admin/fees/StudentFeesCard";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Student review",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "destructive" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">{value || "—"}</dd>
    </div>
  );
}

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("student.read");
  const { id } = await params;
  // The scope travels with the id: a student outside this person's batches
  // reads as "not found", the same way an out-of-scope lead does (docs 04 §1).
  const student = await getStudentForAdmin(id, { userId: user.id, role: user.role });
  if (!student) notFound();

  const seesPii = seesStudentPii(user.role);

  // Only batches of the courses this student asked about can be offered (docs 02 B1).
  const batches = await listSeatOptionsForCourses([
    ...new Set(student.enrollments.map((enrollment) => enrollment.courseId)),
  ]);

  const canManage = can(user.role, "student.approve");

  // Data requests are the one student capability that is not a job function
  // (brief task 9): reading a record is a work need, handing the whole file over
  // or destroying the identity in it is not.
  const canExport = can(user.role, "student.export");
  const canErase = can(user.role, "student.erase");

  // Fees sit behind their own permission: an instructor may review a registration
  // without ever seeing the money (docs 05 §3).
  const canSeeFees = can(user.role, "fee.read");
  const fees = canSeeFees
    ? {
        invoices: await getStudentFeeSummaries(student.id, { includeDrafts: true }),
        enrollments: await listBillableEnrollments(student.id),
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Students", href: "/techdarbar/students" },
          { label: student.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900">
            <GraduationCap className="size-6 text-primary" />
            {student.name}
            <Badge variant={STATUS_VARIANT[student.approvalStatus] ?? "outline"}>
              {student.approvalStatus}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {student.studentCode} · registered {formatDate(student.createdAt)}
            {student.reviewedAt && ` · reviewed ${formatDate(student.reviewedAt)}`}
          </p>
        </div>
        <Link href="/techdarbar/students">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back to list
          </Button>
        </Link>
      </div>

      {student.approvalStatus === "PENDING" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This registration is waiting for approval. The student signed up but cannot edit their
          profile, request courses or publish a portfolio yet.
        </div>
      )}
      {student.approvalStatus === "REJECTED" && student.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Rejected: {student.rejectionReason}
        </div>
      )}

      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-900">Registration decision</h2>
          <StudentReviewControls
            studentId={student.id}
            status={student.approvalStatus}
            canManage={canManage}
          />
          {!canManage && (
            <p className="text-xs text-neutral-500">
              Only Admin and Super Admin can approve or reject registrations.
            </p>
          )}
        </CardContent>
      </Card>

      {(canExport || canErase) && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-900">Data requests</h2>
            <StudentDataControls
              studentId={student.id}
              studentName={student.name}
              can={{ export: canExport, erase: canErase }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Details</h2>
            {seesPii ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="Email" value={student.email} />
                <Field label="Phone" value={student.phone} />
                <Field label="Date of birth" value={student.dateOfBirth} />
                <Field label="City" value={student.city} />
                <Field label="Country" value={student.country} />
                <Field label="Address" value={student.address} />
                <Field label="GitHub" value={student.githubUrl} />
                <Field label="LinkedIn" value={student.linkedinUrl} />
                <Field label="Website" value={student.websiteUrl} />
                <Field
                  label="Portfolio"
                  value={
                    student.portfolioSlug
                      ? `/portfolio/${student.portfolioSlug}${student.portfolioPublic ? " (public)" : " (unpublished)"}`
                      : null
                  }
                />
              </dl>
            ) : (
              <p className="text-sm text-neutral-600">
                Contact details, date of birth and the home address belong to the office: the
                approval, enrolment and fee jobs keep them. What you need here is the name, the
                student code below and the class list.
              </p>
            )}
            {(student.headline || student.bio) && (
              <div className="mt-4 space-y-1 border-t border-neutral-100 pt-4">
                {student.headline && (
                  <p className="text-sm font-medium text-neutral-900">{student.headline}</p>
                )}
                {student.bio && <p className="text-sm text-neutral-600">{student.bio}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-neutral-900">Course requests</h2>
              <EnrollmentDecisionList
                canManage={canManage}
                batches={batches}
                enrollments={student.enrollments.map((e) => ({
                  id: e.id,
                  status: e.status,
                  courseId: e.courseId,
                  courseTitle: e.course.title,
                  requestedAt: formatDate(e.enrolledAt),
                  batchName: e.batch?.name ?? null,
                  decisionNote: e.decisionNote,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-neutral-900">Portfolio projects</h2>
              <p className="text-sm text-neutral-600">
                {student.projectCount} project{student.projectCount === 1 ? "" : "s"} added.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {fees && (
        <StudentFeesCard
          studentId={student.id}
          studentName={student.name}
          invoices={fees.invoices}
          enrollments={fees.enrollments}
          can={{
            create: can(user.role, "fee.write"),
            record: can(user.role, "payment.record"),
          }}
        />
      )}
    </div>
  );
}
