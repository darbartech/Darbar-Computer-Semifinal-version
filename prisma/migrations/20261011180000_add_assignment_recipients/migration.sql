-- CreateTable
CREATE TABLE "AssignmentRecipient" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentRecipient_studentId_seenAt_idx" ON "AssignmentRecipient"("studentId", "seenAt");

-- CreateIndex
CREATE INDEX "AssignmentRecipient_assignmentId_idx" ON "AssignmentRecipient"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentRecipient_assignmentId_studentId_key" ON "AssignmentRecipient"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: assignments created before per-student selection went to everyone
-- enrolled in the course. Without this they would silently stop showing up in
-- the portal the moment reads switch to the recipients table.
INSERT INTO "AssignmentRecipient" ("assignmentId", "studentId")
SELECT a."id", e."studentId"
FROM "Assignment" a
JOIN "Enrollment" e ON e."courseId" = a."courseId" AND e."status" <> 'DROPPED'
ON CONFLICT ("assignmentId", "studentId") DO NOTHING;
