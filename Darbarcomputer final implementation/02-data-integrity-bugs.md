# 02 — Data Integrity & Bug Fixes (B1–B12)

Prerequisite: migration set A from `03-schema-migrations.md` (Counter table, enum values, indexes, CHECK).

---

## B2 — Race-free sequence numbers (do this first)
**Files:** `server/certificates/issuance.ts`, `server/dal/students.ts` (`generateStudentCode`), new `server/dal/counters.ts`

```ts
// server/dal/counters.ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Tx = Prisma.TransactionClient | typeof db;

/** Atomically returns the next value for a named sequence (e.g. "cert:2026"). */
export async function nextSequence(key: string, tx: Tx = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key","value","updatedAt") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1, "updatedAt" = now()
    RETURNING "value"`;
  return rows[0].value;
}
```
Rewrite generators (keep the exported names and formats):
```ts
export async function generateCertificateNumber(year = new Date().getFullYear(), tx?: Tx) {
  const n = await nextSequence(`cert:${year}`, tx);
  if (n > 99999) throw new Error("Certificate sequence exhausted");
  return `${CERTIFICATE_NUMBER_PREFIX}-${year}-${String(n).padStart(5, "0")}`; // + random suffix, see S7
}
export const generateStudentCode = (year = new Date().getFullYear(), tx?: Tx) =>
  nextSequence(`student:${year}`, tx).then((n) => `DT-STU-${year}-${String(n).padStart(5, "0")}`);
```
Rules:
- Call the generator **inside** the same `$transaction` that inserts the row (a rolled-back insert may leave a gap — acceptable; gaps are normal for receipts/certificates, document it).
- In `createStudentAccount`, move `generateStudentCode(…, tx)` *inside* the `db.$transaction` callback (currently it runs before it).
- Wrap issue/register in a helper that retries once on Prisma `P2002`.
- The Counter seeding SQL is in doc 03 (so numbering continues from existing maximum).
- **Delete** `certificateNumberExists`/`verificationTokenExists` pre-checks from the happy path (keep for legacy drafts that already carry a number).

## B3 — Atomic certificate state transitions
**File:** `server/actions/certificates/certificates.actions.ts` (issue ≈ L370–415, reissue ≈ L525–560), `dal/certificates/certificates.dal.ts`

Replace read-then-update with a conditional update:
```ts
const res = await tx.certificate.updateMany({
  where: { id, status: { in: ["DRAFT", "PENDING_ISSUE"] } },
  data: { status: "ISSUED", certificateNumber, verificationToken, issuedAt: new Date(), issueDate },
});
if (res.count !== 1) return fail("This certificate was already issued or changed. Refresh the page.");
```
Same for revoke (`status in ISSUED, REISSUED`) and reissue (the old row must be flipped in the same transaction that inserts the new one). Put number generation, update, signatories insert, and audit-meta preparation in one `$transaction`; generate the PDF **after** commit (already how it works), and keep the on-demand PDF fallback.

Optional DB guard (check existing data first with the query in doc 03):
```sql
CREATE UNIQUE INDEX "Certificate_one_active_per_student_course"
ON "Certificate"("studentId","courseId") WHERE status IN ('ISSUED','REISSUED') AND "studentId" IS NOT NULL AND "courseId" IS NOT NULL;
```
Only add it if a reissue leaves exactly one `ISSUED/REISSUED` row (confirm `reissueCertificate` marks the old one `REVOKED`).

## B4 — One student ID
Decision: **`StudentProfile.studentCode` (`DT-STU-…`) is the only student ID.**
1. When a certificate is created for a student (`studentId` set), copy `recipientIdNumber = student.studentCode` server-side; ignore client input.
2. For certificates without a portal account keep the free `recipientIdNumber`, but stop generating `DT-STD-…`; instead leave empty or let staff enter the physical admission no.
3. Remove `generateStudentId` after migrating usages. Backfill: `UPDATE "Certificate" c SET "recipientIdNumber" = s."studentCode" FROM "StudentProfile" s WHERE c."studentId" = s.id;`
4. `getStudentCertificateDownloadMeta` takes `studentCode` today — switch to `studentId` only (the id check is the real authorisation).

## B1 — Batch ↔ enrollment ↔ seats
**Files:** `server/dal/students.ts` (`setEnrollmentDecision`), `server/actions/student-admin.ts`, `server/dal/batches.ts`, `server/actions/batches.ts`, `components/admin/StudentReviewControls.tsx`, `lib/validators/batch.ts`

Principles
- `seatsTaken` is **maintained only by enrollment transitions**, never typed by staff. Remove the field from the batch form (show it read-only).
- `FULL` is **computed** (`seatsTaken >= seatsTotal`). Stop writing `BatchStatus.FULL`; keep the enum value for compatibility.
- DB `CHECK ("seatsTaken" >= 0 AND "seatsTaken" <= "seatsTotal")` (doc 03).

Approve with a batch (new DAL function; replaces `setEnrollmentDecision` for `ACTIVE`):
```ts
export async function approveEnrollment(enrollmentId: string, batchId: string) {
  return db.$transaction(async (tx) => {
    const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { courseId: true } });
    if (!e) return { ok: false as const, error: "Enrollment not found" };

    const b = await tx.batch.findUnique({ where: { id: batchId }, select: { courseId: true, status: true } });
    if (!b || b.courseId !== e.courseId) return { ok: false as const, error: "Batch does not belong to this course" };
    if (b.status === "CANCELLED" || b.status === "COMPLETED") return { ok: false as const, error: "Batch is closed" };

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: { in: ["PENDING", "WAITLISTED"] } },
      data: { status: "ACTIVE", batchId },
    });
    if (moved.count !== 1) return { ok: false as const, error: "Request was already handled" };

    const claimed = await tx.$executeRaw`
      UPDATE "Batch" SET "seatsTaken" = "seatsTaken" + 1
      WHERE id = ${batchId} AND "seatsTaken" < "seatsTotal"`;
    if (claimed !== 1) throw new BatchFullError(); // rolls back the enrollment update
    return { ok: true as const };
  });
}
```
Catch `BatchFullError` in the action → offer "Add to waiting list" (sets `WAITLISTED`, no seat).

Release a seat when an ACTIVE enrollment becomes `DROPPED`/`REJECTED`/(refund): same transaction, `UPDATE "Batch" SET "seatsTaken" = "seatsTaken" - 1 WHERE id = … AND "seatsTaken" > 0`. Moving a student between batches = release + claim in one transaction.

UI: in the enrollment review row, replace the single "Approve" button with a **batch select** (only batches of that course, status UPCOMING/OPEN/RUNNING, showing `3 seats left`) + **Approve**, **Waitlist**, **Decline (reason)**.

`deleteBatch`: refuse when `seatsTaken > 0` or enrollments exist (`"Move or drop the students first"`); otherwise allow. Prefer setting `status = CANCELLED`.

Nightly reconcile (doc 07) — fixes drift:
```sql
UPDATE "Batch" b SET "seatsTaken" = x.c FROM (
  SELECT "batchId", count(*) c FROM "Enrollment" WHERE status IN ('ACTIVE','COMPLETED') AND "batchId" IS NOT NULL GROUP BY 1) x
WHERE b.id = x."batchId" AND b."seatsTaken" <> x.c;
```
Public pages: show "Seats left: N" from the cached batch list; invalidate `BATCH_TAGS` on every transition.

## B6 — Distinct enrollment outcomes
Enum (doc 03): `EnrollmentStatus` += `REJECTED`, `WAITLISTED`; add `Enrollment.decisionNote`, `decidedById`, `decidedAt`.
- Decline → `REJECTED` (+ note). Student drops later → `DROPPED`.
- Student re-request after `REJECTED` is blocked for 30 days or requires staff reopening; after `DROPPED` it is allowed (current behaviour).
- `requestCourseEnrollment`: wrap `create` in try/catch `P2002` → return `existing`.
- Update `StudentEnrollmentView` badges and `StatusBadges.tsx` for the new states, and the dashboard counts.

## B5 — Staff-side admission
See `04-roles-admissions-leads.md` §2.

## B7 — Lead CSV export
See `04-roles-admissions-leads.md` §3 (with formula-injection escaping).

## B8 — Phone normalisation
See `04-roles-admissions-leads.md` §4.

## B9 — Tests
See `09-testing-operations.md`.

## B10 — Dates in Nepal time
Create `src/lib/dates.ts`:
```ts
const TZ = "Asia/Kathmandu";
export const fmtDate = (d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-NP", { timeZone: TZ, ...opts }).format(new Date(d));
export const fmtDateTime = (d: Date | string) => fmtDate(d, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const startOfDayNpt = (d = new Date()) => new Date(new Date(d.toLocaleString("en-US", { timeZone: TZ })).setHours(0, 0, 0, 0));
```
Replace every `toLocaleDateString/String` in `CourseForm.tsx`, `SettingsPanel.tsx` and others (`grep -rn "toLocale" src`). Dates stored as `@db.Date` (Batch.startDate, DOB) must be parsed as `YYYY-MM-DD` strings, never via `new Date(local)`, to avoid off-by-one. BS (Bikram Sambat) display: see doc 08 §6.

## B11 — Dead content
Confirm `prisma/seed.ts` does not import `src/content/*`; if it does, move the files to `prisma/seed-data/`; otherwise delete `src/content/` (≈3k lines).

## B12 — Large files
Split on next touch: `SettingsPanel.tsx` → one component per tab; `certificateRenderer.ts` → `zones/*.ts`. No functional change; add a snapshot test of rendered PDFs (page count, text extract) before refactoring.

---

## Additional schema-driven fixes

| Issue | Fix |
|---|---|
| `Course` deletion cascades to `Enrollment`, `Batch`, `Assignment` | Change to `onDelete: Restrict` for `Enrollment.course`; keep archive-only in UI; add a DB-level protection test |
| `deleteBatch` hard delete | See B1 |
| Redundant indexes | Drop duplicates (doc 03) — fewer writes, smaller DB |
| `AuditLog` lookups by actor/action slow | Add indexes (doc 03) |
| `Lead` has no link to student | `Lead.studentId` (doc 03/04) |
| `Enrollment.completedAt` set manually? | Set automatically when status → COMPLETED (in the same transition function) |
