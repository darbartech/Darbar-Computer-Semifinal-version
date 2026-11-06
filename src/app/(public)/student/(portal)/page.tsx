import Link from "next/link";
import { BookOpen, Award, FolderGit2, ArrowRight, GraduationCap, Link2, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { AssignmentNoticePopup } from "@/components/student/AssignmentNoticePopup";
import { requireStudentProfile } from "@/server/student-session";
import {
  listStudentCertificates,
  listStudentEnrollments,
  listStudentProjects,
} from "@/server/dal/students";
import { listStudentAssignments } from "@/server/dal/assignments";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EnrollmentStatusBadge } from "@/components/admin/StatusBadges";

export default async function StudentDashboardPage() {
  const { profile } = await requireStudentProfile();
  const [enrollments, certificates, projects, assignments] = await Promise.all([
    listStudentEnrollments(profile.id),
    listStudentCertificates({ id: profile.id }),
    listStudentProjects(profile.id),
    listStudentAssignments(profile.id),
  ]);

  const issued = certificates.filter((c) => c.status === "ISSUED");
  // A waitlisted request is still open, so it belongs on the dashboard next to
  // pending ones; REJECTED/DROPPED are history and live on the courses page.
  const activeCourses = enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "PENDING" || e.status === "WAITLISTED"
  );
  // `isNew` is the unread marker: true until the student opens /student/assignments.
  const unreadAssignments = assignments.filter((assignment) => assignment.isNew);

  const stats = [
    { icon: BookOpen, label: "Enrolled courses", value: enrollments.length },
    { icon: Award, label: "Certificates earned", value: issued.length },
    { icon: FolderGit2, label: "Portfolio projects", value: projects.length },
  ];

  const notices = unreadAssignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    courseTitle: assignment.courseTitle,
    dueDate: assignment.dueDate,
    isOverdue: assignment.isOverdue,
  }));

  return (
    <div className="space-y-8">
      <AssignmentNoticePopup notices={notices} />
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
          Welcome back, {profile.name.split(" ")[0]}
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          Your learning, certificates and portfolio in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-neutral-900">{stat.value}</div>
                  <div className="text-xs text-neutral-500">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {unreadAssignments.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">
                  {unreadAssignments.length} new assignment{unreadAssignments.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {unreadAssignments.slice(0, 3).map((assignment) => (
                    <li key={assignment.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="truncate text-neutral-800">{assignment.title}</span>
                      <span className="text-xs text-neutral-500">{assignment.courseTitle}</span>
                      {assignment.dueDate && (
                        <Badge variant={assignment.isOverdue ? "destructive" : "outline"}>
                          {assignment.isOverdue ? "was due" : "due"}{" "}
                          {formatDate(assignment.dueDate)}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/student/assignments"
                  className={cn(buttonVariants({ size: "sm" }), "mt-3")}
                >
                  Open assignments
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-neutral-900">My courses</h3>
              <Link href="/student/courses" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            {activeCourses.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <GraduationCap className="mx-auto size-8 text-neutral-300" />
                  <p className="mt-3 text-sm text-neutral-600">
                    You are not enrolled in a course yet.
                  </p>
                  <Link
                    href="/courses"
                    className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
                  >
                    Browse courses
                    <ArrowRight className="size-4" />
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeCourses.slice(0, 3).map((enrollment) => (
                  <Card key={enrollment.id}>
                    <CardContent className="p-5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 truncate">
                          {enrollment.course.title}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">
                          {enrollment.batch
                            ? `${enrollment.batch.name} · starts ${enrollment.batch.startDate}`
                            : enrollment.course.tagline}
                        </p>
                        {enrollment.decisionNote && enrollment.status !== "ACTIVE" && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">
                            Note: {enrollment.decisionNote}
                          </p>
                        )}
                      </div>
                      <EnrollmentStatusBadge status={enrollment.status} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-neutral-900">Quick links</h3>
          <Card>
            <CardContent className="p-5 space-y-3">
              <Link
                href="/student/profile"
                className="flex items-center justify-between text-sm font-medium text-neutral-800 hover:text-primary"
              >
                Update your profile <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/student/certificates"
                className="flex items-center justify-between text-sm font-medium text-neutral-800 hover:text-primary"
              >
                Certificates ({issued.length}) <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/student/assignments"
                className="flex items-center justify-between text-sm font-medium text-neutral-800 hover:text-primary"
              >
                Assignments
                {unreadAssignments.length > 0 ? ` (${unreadAssignments.length} new)` : ""}{" "}
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/student/portfolio"
                className="flex items-center justify-between text-sm font-medium text-neutral-800 hover:text-primary"
              >
                Manage portfolio <ArrowRight className="size-4" />
              </Link>
              {profile.portfolioPublic && profile.portfolioSlug && (
                <a
                  href={`/portfolio/${profile.portfolioSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-sm font-medium text-primary hover:underline pt-2 border-t border-neutral-100"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 className="size-4" />
                    View public portfolio
                  </span>
                  <ArrowRight className="size-4" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
