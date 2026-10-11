import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentTask } from "@/components/student/AssignmentTask";
import { MarkAssignmentsSeen } from "@/components/student/MarkAssignmentsSeen";
import { requireStudentProfile } from "@/server/student-session";
import { listStudentAssignments } from "@/server/dal/assignments";

export default async function StudentAssignmentsPage() {
  const { profile } = await requireStudentProfile();
  const assignments = await listStudentAssignments(profile.id);

  return (
    <div>
      <MarkAssignmentsSeen enabled={assignments.some((assignment) => assignment.isNew)} />
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Assignments</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Tasks set by your instructors. Submit one link per assignment — you can replace it until
          the work is reviewed.
        </p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="mx-auto size-10 text-neutral-300" />
            <p className="mt-4 font-medium text-neutral-900">No assignments yet</p>
            <p className="text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              Tasks appear here as soon as an instructor assigns one to you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {assignments.map((assignment) => (
            <AssignmentTask
              key={assignment.id}
              id={assignment.id}
              title={assignment.title}
              instructions={assignment.instructions}
              dueDate={assignment.dueDate}
              isOverdue={assignment.isOverdue}
              isNew={assignment.isNew}
              courseTitle={assignment.courseTitle}
              courseSlug={assignment.courseSlug}
              submission={assignment.submission}
            />
          ))}
        </div>
      )}
    </div>
  );
}
