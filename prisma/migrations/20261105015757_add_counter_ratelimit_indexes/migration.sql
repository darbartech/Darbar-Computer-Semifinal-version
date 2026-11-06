-- DropIndex
DROP INDEX "Certificate_certificateNumber_idx";

-- DropIndex
DROP INDEX "Certificate_verificationToken_idx";

-- DropIndex
DROP INDEX "Session_token_idx";

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- Hand-written (docs: 03-schema-migrations A2)
-- Seed the counters from existing rows so numbering continues where it left off
-- instead of restarting at 1 and colliding with the unique constraints.
INSERT INTO "Counter"("key","value","updatedAt")
SELECT 'cert:' || substring("certificateNumber" from '-(\d{4})-'),
       max(substring("certificateNumber" from '(\d+)(?:-[A-Z0-9]{4})?$')::int), now()
FROM "Certificate" WHERE "certificateNumber" ~ '^DT-CERT-\d{4}-\d+'
GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

INSERT INTO "Counter"("key","value","updatedAt")
SELECT 'student:' || substring("studentCode" from '-(\d{4})-'),
       max(substring("studentCode" from '(\d+)$')::int), now()
FROM "StudentProfile" WHERE "studentCode" ~ '^DT-STU-\d{4}-\d+$'
GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

-- Seat safety: a batch can never report more takers than seats, nor negative.
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_seats_check" CHECK ("seatsTaken" >= 0 AND "seatsTaken" <= "seatsTotal");
