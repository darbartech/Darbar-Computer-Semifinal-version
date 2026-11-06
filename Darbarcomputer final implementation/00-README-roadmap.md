# DarbarTech Institute Platform — Implementation Guide (Index)

Companion to `DarbarTech-Project-Audit.md`. These files tell you **what to change, in which file, in what order**, with code you can adapt.

## How to use these documents

| File | Topic | Do it when |
|---|---|---|
| `01-security-hardening.md` | S1–S13 security fixes | **Week 1** |
| `02-data-integrity-bugs.md` | B1–B12 bug fixes (numbering, seats, state races, enrollment) | **Week 1–2** |
| `03-schema-migrations.md` | Every Prisma/SQL change in one ordered list | Before any feature work |
| `04-roles-admissions-leads.md` | New roles, staff-side admission, lead→student, export, reminders | Week 2–3 |
| `05-fees-payments.md` | Invoices, instalments, receipts, eSewa/Khalti | Weeks 4–5 |
| `06-attendance-timetable-exams.md` | Batches schedule, attendance, exams, certificate eligibility | Weeks 5–7 |
| `07-notifications-reports.md` | Email/SMS, cron jobs, director reports | Weeks 7–9 |
| `08-ux-improvements.md` | Screens, copy, accessibility, Nepali/BS support | Alongside each phase |
| `09-testing-operations.md` | Tests, CI, backups, monitoring, go-live checklist | Start in week 1, finish last |

## Corrections / new facts after reading `prisma/`

1. **Tests exist.** `seed-test.ts` refers to `e2e/helpers.ts`, so a Playwright suite lives outside the zip. My earlier "no tests" only applied to `src/`. Doc 09 lists what to *add*.
2. **Seed is safe.** `seed.ts` refuses placeholder admin passwords and skips certificate demo data in production; `seed-test.ts` refuses to run in production. Good.
3. **New schema findings** (details in docs 02/03):
   - `Course → Enrollment/Batch/Assignment` are `onDelete: Cascade`. Deleting a course would silently erase student enrollment history. Use `Restrict`.
   - `BatchStatus.FULL` is stored although it is derivable, and it overwrites `RUNNING` — a full running batch loses its lifecycle state. Make FULL computed.
   - `Batch.seatsTaken` has no DB `CHECK` (0 ≤ seatsTaken ≤ seatsTotal).
   - `deleteBatch` hard-deletes; enrollments are left with `batchId = NULL`.
   - Redundant indexes: `Session@@index([token])`, `Certificate@@index([verificationToken])`, `Certificate@@index([certificateNumber])` duplicate the unique indexes.
   - `AuditLog` has no index on `actorId`/`action`.
   - Nothing stops two `ISSUED` certificates for the same student + course.
   - No place for guardian/emergency contact, no lead↔student link, no phone normalisation column.
   - No counter table, so sequence numbers rely on `max()+1` (race).

## Delivery order (dependency graph)

```
Week 1   01 Security  ─┐
         02 Bugs      ─┼─> 03 Migration set A (Counter, RateLimitBucket, enum values, indexes)
Week 2-3 04 Roles + Admissions (needs migration set B)
Week 4-5 05 Fees (needs 04 roles: ACCOUNTANT) ─┐
Week 5-7 06 Attendance/Exams (needs 02 batch seats + 04 INSTRUCTOR) ─┼─> certificate eligibility uses 05 + 06
Week 7-9 07 Notifications/Reports (uses everything above)
```

## Working rules for every change

1. **One migration per PR.** `npx prisma migrate dev --name <name>`; review the generated SQL; add the hand-written SQL blocks from doc 03 to the *same* migration file.
2. **Back up first** (`pg_dump`) before running any migration on production; test on a copy.
3. **Every new server action** follows your existing pattern: `requirePermission` → zod parse → DAL call → `audit()` → `invalidate(tags)` → typed `ActionResult`.
4. **Every new permission** goes into `src/server/permissions.ts` *and* into a unit test that snapshots the matrix (doc 09).
5. **Money and certificate numbers are never edited, only voided/revoked** (append-only history).
6. **Verify library APIs against your installed versions** (Better Auth, Next 16, Prisma). Function names in the snippets (`requestPasswordReset`, `twoFactor`, etc.) changed across Better Auth releases; check `node_modules/better-auth` types before copying.
7. Use `Asia/Kathmandu` for every business date (doc 08 §6).

## Definition of done per item

- Code + migration merged, audited action present.
- Unit test (and Playwright test for user-visible flows).
- Permission row added and tested for *denied* roles.
- Docs/changelog line and a screenshot for UX changes.
