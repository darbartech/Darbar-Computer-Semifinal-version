import Image from "next/image";
import Link from "next/link";
import { BookOpen, GraduationCap, CalendarClock, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { requireStudentProfile } from "@/server/student-session";
import { listStudentEnrollments } from "@/server/dal/students";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary" | "outline"> = {
  PENDING: "outline",
  ACTIVE: "secondary",
  COMPLETED: "success",
  DROPPED: "outline",
};

export default async function StudentCoursesPage() {
  const { profile } = await requireStudentProfile();
  const enrollments = await listStudentEnrollments(profile.id);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">My courses</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Courses and batches linked to your student account.
        </p>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <GraduationCap className="mx-auto size-10 text-neutral-300" />
            <p className="mt-4 font-medium text-neutral-900">No courses yet</p>
            <p className="text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              Once the institute enrolls you in a course or batch, it will appear here.
            </p>
            <Link
              href="/courses"
              className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
            >
              Browse courses
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {enrollments.map((enrollment) => (
            <Card key={enrollment.id} className="overflow-hidden flex flex-col">
              <div className="relative aspect-[16/9] bg-neutral-100">
                {enrollment.course.coverUrl ? (
                  <Image
                    src={enrollment.course.coverUrl}
                    alt={enrollment.course.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-primary/20">
                    <BookOpen className="size-14" />
                  </div>
                )}
              </div>
              <CardContent className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900 leading-snug">
                    {enrollment.course.title}
                  </h3>
                  <Badge variant={STATUS_VARIANT[enrollment.status] ?? "outline"}>
                    {enrollment.status}
                  </Badge>
                </div>
                <p className="text-sm text-neutral-600">{enrollment.course.tagline}</p>
                <div className="mt-auto space-y-1.5 text-xs text-neutral-500 pt-2">
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    Enrolled {formatDate(enrollment.enrolledAt)}
                  </p>
                  {enrollment.batch && (
                    <p>
                      Batch: {enrollment.batch.name} · starts {formatDate(enrollment.batch.startDate)} ·{" "}
                      {enrollment.batch.timeSlot}
                    </p>
                  )}
                  {enrollment.completedAt && <p>Completed {formatDate(enrollment.completedAt)}</p>}
                </div>
                <Link
                  href={`/courses/${enrollment.course.slug}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View course
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
