-- CreateEnum
CREATE TYPE "StudentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN "approvalStatus" "StudentApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- Backfill: students registered before the approval workflow are grandfathered in.
UPDATE "StudentProfile" SET "approvalStatus" = 'APPROVED'::"StudentApprovalStatus";

-- CreateIndex
CREATE INDEX "StudentProfile_approvalStatus_idx" ON "StudentProfile"("approvalStatus");
