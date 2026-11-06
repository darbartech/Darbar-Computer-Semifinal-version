# 03 — Schema & Migration Plan (all Prisma/SQL changes, in order)

Rules: one migration per set; run `prisma migrate dev --create-only`, edit the SQL, then apply. Back up before production. Postgres enum `ADD VALUE` cannot be *used* in the same transaction that adds it — keep enum additions in their own migration (A1).

---

## Set A — Integrity & security (week 1)

### A1 `add_enum_values`
```prisma
enum Role              { SUPER_ADMIN ADMIN EDITOR COUNSELOR STUDENT INSTRUCTOR ACCOUNTANT RECEPTION }
enum EnrollmentStatus  { PENDING ACTIVE COMPLETED DROPPED REJECTED WAITLISTED }
```
(`BatchStatus.FULL` stays in the enum but is no longer written.)

### A2 `add_counter_ratelimit_indexes`
```prisma
model Counter {
  key       String   @id            // "cert:2026", "student:2026", "invoice:2026", "receipt:2026"
  value     Int      @default(0)
  updatedAt DateTime @updatedAt
}

model RateLimitBucket {
  key         String
  windowStart DateTime
  count       Int      @default(1)
  @@id([key, windowStart])
  @@index([windowStart])
}

// Index hygiene
model Session     { /* remove */ /* @@index([token]) */ }
model Certificate { /* remove */ /* @@index([verificationToken]) @@index([certificateNumber]) */ }
model AuditLog    { /* add */    @@index([actorId, createdAt])  @@index([action, createdAt]) }
```
Hand-written SQL to append to the migration:
```sql
-- Seed counters from existing data so numbering continues
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

-- Seat safety
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_seats_check" CHECK ("seatsTaken" >= 0 AND "seatsTaken" <= "seatsTotal");
-- If this fails, fix data first: SELECT id,name,"seatsTaken","seatsTotal" FROM "Batch" WHERE "seatsTaken" > "seatsTotal";

-- Pre-check before the optional unique index in doc 02 (B3):
-- SELECT "studentId","courseId",count(*) FROM "Certificate"
--  WHERE status IN ('ISSUED','REISSUED') AND "studentId" IS NOT NULL AND "courseId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;
```

### A3 `course_delete_restrict`
```prisma
model Enrollment { course Course @relation(fields: [courseId], references: [id], onDelete: Restrict) ... }
```
(Batch and Assignment may stay `Cascade` if courses are archive-only; prefer `Restrict` for all three.)

### A4 `enrollment_decision_fields`
```prisma
model Enrollment {
  decisionNote String?
  decidedById  String?
  decidedAt    DateTime?
}
```

### A5 `two_factor` (generated)
Run `npx @better-auth/cli generate`, copy `twoFactorEnabled` on `User` and the `TwoFactor` model. Also `RateLimit` model **only** if you keep Better Auth's database limiter.

### A6 `lead_soft_delete_and_phone`
```prisma
model Lead {
  deletedAt       DateTime?
  phoneNormalized String?
  studentId       String?        @unique       // set on conversion
  student         StudentProfile? @relation(fields: [studentId], references: [id], onDelete: SetNull)
  @@index([phoneNormalized])
  @@index([deletedAt])
}
```
(Add `lead Lead?` back-relation on `StudentProfile`.) Backfill `phoneNormalized` with the script in doc 04 §4.

---

## Set B — People, admissions, batches (weeks 2–3)

### B1 `student_admission_fields`
```prisma
model StudentProfile {
  guardianName          String?
  guardianPhone         String?
  guardianRelation      String?
  emergencyContactName  String?
  emergencyContactPhone String?
  previousQualification String?
  admissionSource       LeadSource?          // how they found the institute
  admittedById          String?              // staff who created/approved
  admittedAt            DateTime?
  idDocumentId          String?              // optional scan, private bucket (see note)
}
```
Note: ID scans must **not** go into the public Media table/Cloudinary public folder. Use private storage (like `storage/certificates`) with an authenticated download route, or skip ID scans.

### B2 `batch_schedule`
```prisma
model Room {
  id       String   @id @default(cuid())
  name     String   @unique
  kind     RoomKind @default(CLASSROOM)
  capacity Int
  isActive Boolean  @default(true)
  schedules BatchSchedule[]
}
enum RoomKind { CLASSROOM LAB ONLINE }

model Batch {
  endDate      DateTime? @db.Date
  instructorId String?
  instructor   User?     @relation("BatchInstructor", fields: [instructorId], references: [id], onDelete: SetNull)
  schedules    BatchSchedule[]
  @@index([instructorId])
}

model BatchSchedule {
  id        String @id @default(cuid())
  batchId   String
  batch     Batch  @relation(fields: [batchId], references: [id], onDelete: Cascade)
  weekday   Int                    // 0=Sunday … 6=Saturday (Nepal week starts Sunday)
  startTime String                 // "07:00"
  endTime   String                 // "08:30"
  roomId    String?
  room      Room?  @relation(fields: [roomId], references: [id], onDelete: SetNull)
  @@unique([batchId, weekday, startTime])
  @@index([roomId, weekday])
}
```
(`User` gets `batchesTaught Batch[] @relation("BatchInstructor")`.)

---

## Set C — Fees & payments (weeks 4–5)  → full spec in doc 05
`Invoice`, `InvoiceInstallment`, `Payment`, `PaymentIntent`, enums `InvoiceStatus`, `PaymentMethod`, `PaymentStatus`, `PaymentProvider`.

## Set D — Attendance, exams (weeks 5–7)  → doc 06
`AttendanceSession`, `AttendanceRecord`, `Exam`, `ExamResult`, enums `AttendanceStatus`.

## Set E — Notifications & reports (weeks 7–9)  → doc 07
`NotificationLog`, `NotificationTemplate` (optional), `Holiday` (optional).

---

## Procedure for each set

```bash
pg_dump -Fc "$DATABASE_URL" > backup-$(date +%F).dump          # production only
npx prisma migrate dev --name <name> --create-only             # review SQL
# add hand-written SQL, then:
npx prisma migrate dev
npx prisma generate
npm run typecheck && npm test
# production:
npx prisma migrate deploy
```
Rollback plan: restore dump to a new database and swap `DATABASE_URL`; never edit applied migrations — add a new one.

## Index review (after sets A–D)
- `Enrollment @@index([studentId, status])`, `@@index([batchId, status])` (seat counts, dashboards)
- `Lead @@index([followUpAt])` (reminders)
- `AssignmentSubmission @@index([assignmentId, reviewStatus])` (review queue)
- `Payment @@index([invoiceId])`, `@@index([receivedAt])`; `Invoice @@index([studentId, status])`, `@@index([dueDate, status])`
- `AttendanceRecord @@index([enrollmentId])`
Run `EXPLAIN ANALYZE` on the dashboard queries in `server/dal/dashboard.ts` with realistic volume (e.g. 5,000 leads, 2,000 students) before adding more.
