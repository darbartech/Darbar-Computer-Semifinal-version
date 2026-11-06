# 06 — Timetable, Attendance, Exams & Certificate Eligibility

Needs: B1 seats (doc 02), roles INSTRUCTOR (doc 04), migration B2 (`Room`, `BatchSchedule`, `Batch.instructorId/endDate`), set D below.

---

## 1. Timetable & rooms
**Data:** `Room`, `BatchSchedule`, `Batch.instructorId/endDate` (doc 03 B2).
**Admin UI:** Batch form gets *Instructor*, *End date*, and a **weekly schedule editor** (rows: weekday, start, end, room). Sunday-first week.

**Clash check** (run on save, in a transaction, return a readable error):
```sql
-- another batch uses the same room/instructor at an overlapping time on the same weekday
SELECT b.name, s.weekday, s."startTime", s."endTime"
FROM "BatchSchedule" s JOIN "Batch" b ON b.id = s."batchId"
WHERE s."batchId" <> $batchId AND s.weekday = $weekday
  AND b.status IN ('UPCOMING','OPEN','RUNNING')
  AND (b."endDate" IS NULL OR b."endDate" >= $startDate) AND b."startDate" <= COALESCE($endDate, 'infinity')
  AND (s."roomId" = $roomId OR b."instructorId" = $instructorId)
  AND s."startTime" < $endTime AND s."endTime" > $startTime;
```
Also warn when `Room.capacity < seatsTotal`.
**Views:** `/techdarbar/timetable` (week grid by room, by instructor, by batch), print-friendly PDF; student portal "My classes this week"; public course page can show "Morning 7–8:30, Sun–Fri" derived from schedules (replaces free text `batchFrequency`).
**Holidays:** treat `Notice` rows of type `HOLIDAY`/`CLOSURE` (with `startsAt/endsAt`) as no-class days when generating sessions; add an optional `Holiday` table later for BS festival dates.

---

## 2. Attendance
### Schema (set D1)
```prisma
enum AttendanceStatus { PRESENT ABSENT LATE EXCUSED }

model AttendanceSession {
  id        String   @id @default(cuid())
  batchId   String
  batch     Batch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date
  topic     String?
  takenById String?
  lockedAt  DateTime?
  createdAt DateTime @default(now())
  records   AttendanceRecord[]
  @@unique([batchId, date])
  @@index([date])
}

model AttendanceRecord {
  id           String           @id @default(cuid())
  sessionId    String
  session      AttendanceSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  enrollmentId String
  enrollment   Enrollment       @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  status       AttendanceStatus
  note         String?
  @@unique([sessionId, enrollmentId])
  @@index([enrollmentId])
}
```
### Rules
- A session is created per class day (auto-suggested from `BatchSchedule`, or manual for extra classes).
- Roster = enrollments with `status = ACTIVE` and `batchId = batch` **at that date** (students who joined later don't appear in earlier sessions).
- Default everyone PRESENT, instructor taps absentees (fast); `LATE` counts as present for % (configurable); `EXCUSED` is excluded from the denominator.
- **Edit window:** instructor edits same day; after that only ADMIN, with audit entry (`attendance.edit`). `lockedAt` set by nightly job after 48 h.
- Percentage = `(PRESENT+LATE) / (sessions − EXCUSED)`; computed by a SQL view/query, cached per batch.

### Screens
- **Mobile-first "Take attendance"** (`/techdarbar/batches/[id]/attendance/[date]`): sticky header (batch, date), list with large toggle buttons, *Mark all present*, *Save* (one server action, upsert in transaction). Works at 360 px wide, one hand.
- Batch page: calendar strip of sessions with % per day; student row shows monthly %.
- Student detail: attendance history + %.
- Student portal: "My attendance" (read-only %, with warning below threshold).
- Alerts: when a student misses 3 consecutive sessions or falls below the threshold → dashboard card + notification to guardian (doc 07).

### Actions (all `requireBatchAccess`)
`createSessionAction`, `saveAttendanceAction` (idempotent upsert), `reopenSessionAction` (ADMIN).

---

## 3. Exams & results
### Schema (set D2)
```prisma
model Exam {
  id        String   @id @default(cuid())
  batchId   String
  batch     Batch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  title     String                      // "Midterm", "Final practical"
  kind      ExamKind @default(WRITTEN)
  date      DateTime @db.Date
  maxMarks  Int
  passMarks Int
  weight    Int      @default(100)      // percent weight in final result
  publishedAt DateTime?                 // results visible to students only after this
  createdById String?
  results   ExamResult[]
  @@index([batchId, date])
}
enum ExamKind { WRITTEN PRACTICAL VIVA PROJECT }

model ExamResult {
  id           String     @id @default(cuid())
  examId       String
  exam         Exam       @relation(fields: [examId], references: [id], onDelete: Cascade)
  enrollmentId String
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  marks        Decimal?   @db.Decimal(6,2)
  absent       Boolean    @default(false)
  remark       String?
  @@unique([examId, enrollmentId])
}
```
DB check: `marks IS NULL OR (marks >= 0)`; app check `marks ≤ exam.maxMarks`.

### Grading
Settings key `grading.scale` (JSON), e.g. `[{min:85,grade:"A+"},{min:75,grade:"A"},{min:65,grade:"B+"},{min:55,grade:"B"},{min:40,grade:"C"},{min:0,grade:"F"}]` (adjust to your institute). `finalPercent = Σ(marks/maxMarks × weight)/Σweight`. Put logic in `server/services/grading.ts` with unit tests; `Certificate.grade` is filled from it (editable by ADMIN with reason).

### Screens
Exam setup per batch; **marks entry grid** (keyboard-friendly, tab through rows, autosave); publish results; result sheet PDF per student/batch; student portal "My results" (only published); rank list (optional, ADMIN only).

---

## 4. Course completion & certificate eligibility
**Service:** `server/services/eligibility.ts`
```ts
export type Eligibility = {
  eligible: boolean;
  checks: { key: "attendance"|"fees"|"exams"|"assignments"; ok: boolean; detail: string }[];
};
export async function checkEligibility(enrollmentId: string): Promise<Eligibility> { /* reads Settings thresholds */ }
```
Default rules (editable in Settings → *Certification*):
- attendance ≥ **75 %** (`cert.minAttendancePct`)
- fee balance ≤ `fees.allowedDueAmount` (default 0)
- all required exams passed or final % ≥ pass mark
- required assignments REVIEWED (not NEEDS_WORK)

**Flow:**
1. Batch ends → ADMIN opens *Batch → Completion* → table of students with the four checks (✔/✖ + detail).
2. **"Create draft certificates"** for the eligible selection: for each, create `Certificate` with `studentId`, `recipientName`, `recipientIdNumber = studentCode`, `courseId`, `courseName`, `programDuration = "{n} Weeks/Months"`, `completionDate = batch.endDate`, `grade` from grading, `templateId` = active template; status `DRAFT`. Set `Enrollment.status = COMPLETED`, `completedAt`.
3. ADMIN reviews and uses the existing **issue** action (bulk issue = loop with per-item result; do not wrap 40 PDFs in one request — queue or chunk 5 at a time).
4. **Override:** ineligible student can be certified only with `certificate.issue` + typed reason; stored in `Certificate.metadata.eligibilityOverride = {by, reason, failedChecks}` and shown in the audit log.
5. Notify the student (doc 07) with the verify link.

Not-yet-eligible students get "what's missing" in the portal (e.g., "Attendance 68 % / need 75 %").

---

## 5. Instructor experience
Landing page "My batches today": class time, room, roster count, *Take attendance* button, assignments waiting for review (reuse `countSubmissionsAwaitingReview` filtered by instructor), upcoming exams. Instructors cannot see fees, leads, settings; student contact data limited to name/code/phone (no DOB/address).

---

## 6. Acceptance tests
- Clash check blocks same room/instructor overlap; allows back-to-back slots.
- Attendance upsert is idempotent; second save changes records, not duplicates.
- Instructor A cannot read/write instructor B's batch (403, both action and DAL).
- Eligibility: 74.9 % attendance → ineligible; override requires reason and is audited.
- Results hidden from students until `publishedAt`.
