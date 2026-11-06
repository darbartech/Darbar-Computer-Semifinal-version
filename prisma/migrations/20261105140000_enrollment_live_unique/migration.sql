-- Fix guide §9: a student may re-take a course.
--
-- `@@unique([studentId, courseId])` treated the whole relationship as one row for
-- all time, so DROPPED, REJECTED and COMPLETED each locked the student out of that
-- course forever — and the DAL worked around it by rewriting history (a dropped
-- row was updated back to PENDING, losing the decision note, the dates and the
-- fact that they ever left).
--
-- Uniqueness now applies only to the statuses that hold a place in the course: a
-- student can have any number of finished rows and at most one live row. Nothing
-- here rewrites the existing rows, and no pair in the database can violate the new
-- index, because the old constraint was strictly stronger.
--
-- Prisma cannot express a `WHERE` clause, so the schema declares only the lookup
-- index and this migration declares the constraint.
DROP INDEX IF EXISTS "Enrollment_studentId_courseId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_live_student_course_key"
ON "Enrollment" ("studentId", "courseId")
WHERE "status" IN ('PENDING', 'ACTIVE', 'WAITLISTED');

CREATE INDEX IF NOT EXISTS "Enrollment_studentId_courseId_idx"
ON "Enrollment" ("studentId", "courseId");
