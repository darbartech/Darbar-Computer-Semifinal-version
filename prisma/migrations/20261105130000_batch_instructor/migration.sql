-- Fix guide §5: a batch needs a teacher of record, otherwise "own batches only"
-- for the INSTRUCTOR role cannot be expressed anywhere.

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "instructorId" TEXT;

-- CreateIndex
CREATE INDEX "Batch_instructorId_idx" ON "Batch"("instructorId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
