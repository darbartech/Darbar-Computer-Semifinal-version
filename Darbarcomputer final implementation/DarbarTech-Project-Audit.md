# DarbarTech Institute Platform — Deep Audit & Improvement Plan

**Scope reviewed:** the `src/` folder only (357 files, ~52k lines incl. generated Prisma client). No `prisma/schema.prisma`, `package.json`, `next.config`, docs, or tests were in the zip, so DB indexes/constraints, CSP enforcement and dependency versions are **not verified**. I read the auth, permissions, session, rate-limit, upload, student, enrollment, lead, certificate and verify code in full or in the relevant parts; UI components were sampled, not read line by line. Nothing was executed. Items marked **[verified]** were confirmed in the code; **[likely]** need a quick check on your side.

## 0. Overall verdict

The engineering quality is clearly above average for a institute project: server-side RBAC on every action, generic login errors, audit log, private certificate PDFs with path-traversal guard, SSRF host allow-list, magic-number image checks, env validation at boot, open-redirect guard on login.

The main problem is not code quality — it is **scope**. What you have today is a **website CMS + admissions CRM + light student portal + certificate engine**. It is *not yet* an institute *management* system: there is no fee/payment handling, no attendance, no timetable, no instructor role, no exams/results, and enrollment is not connected to batches or seats. Those are what a director and accountant need every day, and they are also where the revenue is.

---

## 1. Security (fix first)

| # | Severity | Finding | Where | Fix |
|---|---|---|---|---|
| S1 | **High** [verified] | **Rate-limit IP can be spoofed.** `clientIpFromHeaders` trusts `cf-connecting-ip` *unconditionally*. If you deploy behind Caddy/Nginx (as the comments say) and not Cloudflare, anyone can send a different `CF-Connecting-IP` on every request and get a fresh bucket for login, register, inquiry, upload and CSP-report limits. | `server/services/rate-limit.ts:42-43` | Trust that header only when an env flag like `TRUST_CLOUDFLARE=true` is set; otherwise use the right-most-hop logic you already wrote. |
| S2 | **High** [verified] | **Full Better Auth HTTP API is exposed** (`/api/auth/*`). Your carefully built per-IP + per-email throttle, role check and audit entry live in the `signInWithPassword` server action, but anyone can POST straight to `/api/auth/sign-in/email` and skip all of them. The library's own limiter is the default in-memory one (resets on restart, not shared across instances) and its IP source is not configured. Result: online password guessing against staff accounts is only weakly limited. | `app/api/auth/[...all]/route.ts`, `server/auth.ts` | Either block `sign-in/*` on the HTTP route (allow only `get-session`/`sign-out`), or move the limiter to `rateLimit.storage: "database"` + set `advanced.ipAddress.ipAddressHeaders`, and put the role/audit logic in a Better Auth `hooks.after`. |
| S3 | **High** [verified] | **Student accounts are created with `emailVerified: true` and no verification.** Anyone can register using someone else's email; the real owner then cannot register (generic error) and has no recovery. Registration also has **no Turnstile/honeypot** (only 5/hour/IP, which S1 defeats) so bots can fill the user table. | `dal/students.ts:156-163`, `actions/student-auth.ts`, `StudentRegisterForm.tsx` | Add email verification (Resend is already integrated), add Turnstile to register + login, and set `emailVerified:false` until confirmed. |
| S4 | **High** [verified] | **No forgot-password / reset flow for students or staff.** Staff reset only works by a SUPER_ADMIN typing a new password. A student who forgets a password is locked out forever. | grep: no `sendResetPassword` anywhere | Enable Better Auth `sendResetPassword` via Resend; add "Forgot password?" links. |
| S5 | Medium [verified] | **Account lock-out DoS.** Per-email limit is 5 tries/15 min. An attacker can burn the 5 attempts on `admin@…` every 15 minutes and the real admin always gets "Email or password is incorrect". Failed logins are also not audited. | `actions/auth.ts:42-48` | Count only failed attempts, add progressive delay + notify on repeated failures, audit `auth.signin.failed`. |
| S6 | Medium [verified] | **No 2FA** for SUPER_ADMIN/ADMIN, who can issue/revoke certificates, delete leads and reset passwords. | `server/auth.ts` | Enable Better Auth `twoFactor` (TOTP) at least for SUPER_ADMIN and ADMIN. |
| S7 | Medium [verified] | **Public certificate verification is enumerable.** Numbers are sequential (`DT-CERT-2026-00001`) and the public lookup accepts number *or* student ID, returning name + course. Anyone can walk the whole graduate list at the throttle rate. | `dal/certificates/certificates.dal.ts:~165-200`, `issuance.ts` | Keep the QR token (24 random bytes) as the primary key; for number lookups require number **plus** a second factor (e.g. year + last name initial, or student ID), mask the recipient name partly, and apply a hard per-IP limit + Turnstile. |
| S8 | Medium [verified] | `allow()` is count-then-insert, not atomic, so a burst of parallel requests all pass; it also runs a `deleteMany` on every allowed call (write amplification on a hot table). | `rate-limit.ts:105-130` | Single `INSERT … ON CONFLICT` counter row per (key, window), or Postgres advisory lock; clean up in a daily job. Ensure an index on `(key, createdAt)` [schema not seen]. |
| S9 | Low [verified] | Turnstile is verified *before* the rate limit and without `remoteip`, so every spam request costs an outbound call to Cloudflare. | `actions/public-forms.ts`, `turnstile.ts` | Rate-limit first (cheap), then Turnstile; pass the real IP. |
| S10 | Low [likely] | CSP is **report-only** (per comments in `csp-report/route.ts`). It gives no protection until enforced. | `next.config.mjs` (not in zip) | Review reports for a week, then enforce. |
| S11 | Low | Student password minimum is 8 with no breach/strength check; staff 10. | `lib/validators/student.ts` | Raise to 10, add zxcvbn-style strength meter. |
| S12 | Low | Public `cached()` verify lookups are keyed on arbitrary user input → unbounded cache keys. | `certificates.dal.ts` | Validate the format before the cached call; do not cache misses. |
| S13 | Privacy | Hard-delete of leads, no retention policy, no student data export/erasure. Student DOB/address/phone are stored. | `actions/leads.ts:373` | Add soft-delete + retention period; write a short privacy policy covering Nepal's Privacy Act 2075. |

**Already good (keep):** server-side `requirePermission` on actions, deactivated users' sessions revoked, last-SUPER_ADMIN protection, private certificate storage, remote-PDF host allow-list, upload MIME + magic bytes, JSON-LD serialiser, login `next` validated, honeypot + Turnstile + DB limit on public forms.

---

## 2. Bugs and data-integrity problems

| # | Severity | Finding | Where | Fix |
|---|---|---|---|---|
| B1 | **High** [verified] | **Batch seats are not connected to enrollment.** I found no code path that sets `Enrollment.batchId` or changes `Batch.seatsTaken`; staff type seat numbers by hand and approving an enrollment only flips status to ACTIVE. `FULL/OPEN` batch status therefore never reflects reality, and a student can be ACTIVE in a course with no batch. | `dal/students.ts:775` `setEnrollmentDecision`, `actions/batches.ts` | On approval require a batch, then in one transaction: check `seatsTaken < seatsTotal`, increment, set status FULL when reached; decrement on DROPPED. Derive `seatsTaken` from a count instead of storing it. |
| B2 | **High** [verified] | **Certificate / student number races.** `generateCertificateNumber`, `generateStudentId` and `generateStudentCode` load *every* row of the year into memory, take the max and add 1. Two admins issuing (or two students registering) at the same moment get the same number; the existence check is not atomic and the loser hits a unique-constraint error that is not handled specially. `generateStudentCode` is called *outside* the transaction in `createStudentAccount`, so a student registration can fail randomly. | `certificates/issuance.ts:25-47`, `dal/students.ts:26-50,154` | Use a `Counter` table (`key=year`, `value`) with `UPDATE … RETURNING` inside the same transaction, or a Postgres sequence. Catch `P2002` and retry. |
| B3 | Medium [verified] | **Issue/reissue state check is not atomic**: it reads the status, then updates by id. Two clicks can issue twice or double-reissue. | `certificates.actions.ts:~370-415, 525-560` | `updateMany({ where: { id, status: { in: [...] } } })` and check `count === 1`. |
| B4 | Medium [verified] | **Two different "student IDs" per student**: `DT-STU-…` (portal `studentCode`) and `DT-STD-…` (certificate `recipientIdNumber`). Students and verifiers will see two numbers for one person. | `students.ts:20-26`, `issuance.ts` | One canonical student ID; certificates reference it. |
| B5 | Medium [verified] | **No staff-side "create student".** `createStudentProfile` exists in the DAL but nothing calls it. Walk-in students (the normal case for institutes) must self-register on the website, wait for approval, then request a course. | `dal/students.ts:124` | Add *Admissions → Enrol student* form for receptionist/counselor; convert a Lead to a Student in one click (Lead has status `ENROLLED` but no link to the student). |
| B6 | Medium [verified] | **"Declined" enrollment is saved as `DROPPED`**, so declined and dropped students are indistinguishable in reports. `setEnrollmentDecision` also has a read-then-write race. | `students.ts:775-790` | Add `REJECTED` (or `DECLINED`) status and a reason; make the update conditional on `status = PENDING`. |
| B7 | Low [verified] | **Lead export is unfinished**: permission `lead.export` and `listLeadsForExport` exist but nothing uses them. If you add CSV, escape cells starting with `= + - @` (formula injection). | `permissions.ts:7`, `dal/leads.ts:476` | Implement it (see roadmap) with formula escaping. |
| B8 | Low [verified] | Duplicate-lead detection compares the raw phone string; `98XXXXXXXX`, `+97798…`, `98-…` count as different people. | `dal/leads.ts:52` | Normalise to E.164 (+977) on input and storage. |
| B9 | Low [verified] | **No automated tests** anywhere in `src/` (no `*.test`/`*.spec`). Numbering, permissions and certificate state machines are exactly what breaks silently. | — | Vitest for permissions matrix + numbering + state transitions; Playwright for login/enroll/verify. |
| B10 | Low [likely] | Dates: certificates use `Asia/Kathmandu`, but `CourseForm`/`SettingsPanel` use the browser/default locale → off-by-one-day around midnight. No Bikram Sambat date anywhere. | components listed | One date helper (`Asia/Kathmandu`), plus BS display for certificates/notices. |
| B11 | Low | `src/content/*` (~3k lines of old static courses/blog/FAQ) is no longer imported by the app (only comments mention it) — dead weight unless used by a seed script. | `src/content` | Move to `/prisma/seed` or delete. |
| B12 | Low | Very large files (SettingsPanel 1,091 lines, certificateRenderer 1,277, certificate-v2 1,103) are hard to maintain. | — | Split by section when next touched. |

---

## 3. Missing features for an institute management system (business & education view)

Ranked by value to the institute:

1. **Fees & payments (biggest gap).** Today only `Course.feeNPR` for display exists; no invoices, instalments, dues, discounts/scholarships, receipts, refunds, cash-book. Build: `FeePlan` → `Invoice` → `Payment` (cash / bank / eSewa / Khalti / Fonepay / ConnectIPS), printable receipt with running number, *due list*, fee-clear check before certificate issue.
2. **Batch-driven enrollment.** Fix B1, then show students their batch, timing, room and start date. Waiting list when FULL.
3. **Attendance.** Per-batch daily attendance (mobile-friendly, 10-second entry), monthly % per student, low-attendance alert. Certificate eligibility = attendance ≥ X% *and* fees cleared *and* passed.
4. **Instructor role & workload.** Add `INSTRUCTOR` (and `ACCOUNTANT`, `RECEPTION`) roles. Link instructors to batches; instructors see only their batches, mark attendance and review assignments. Today any EDITOR can review any submission and `TeamMember` is just a public bio.
5. **Timetable / rooms / lab slots.** Weekly schedule per batch, lab/room clash detection, holiday calendar (Notices already has HOLIDAY type).
6. **Exams & results.** Tests, marks, grade rules, result sheet PDF. `Certificate.grade` is currently free text.
7. **Lead → admission pipeline.** You have a good CRM (statuses, follow-up date, activities). Add: follow-up **reminders** (`followUpAt` exists but nothing alerts), one-click convert to student + invoice, lost-reason report, source/UTM → *enrolled* conversion and cost-per-admission report.
8. **Communication.** Only staff get an email today. Add student emails (welcome, approved, fee due, class cancelled), **SMS** (Sparrow/Aakash) and WhatsApp click-to-chat templates — in Nepal SMS/WhatsApp beats email.
9. **Learning content.** Assignments are only a pasted URL. Add file upload (or Drive link validation), course materials/recordings per batch, simple quizzes.
10. **Reports for the director.** Admissions per month, revenue vs dues, batch fill rate, dropout rate, counselor performance, attendance trend. Export to Excel/PDF. (`dal/dashboard.ts` is the place to grow.)
11. **Alumni & placement.** Courses already have an `internship` field; add placement/internship records per student and a public "Our graduates" page — a strong marketing asset.
12. **Admission data completeness.** Guardian name/phone, emergency contact, ID photo/citizenship copy, previous qualification, how-did-you-hear-about-us.
13. **Parent view / guardian SMS** (absence + fee due).
14. **Course feedback surveys** per batch → feeds testimonials and quality control.
15. **Backups & ops.** Automated daily Postgres dump + offsite copy, restore drill, uptime monitor, error tracking (Sentry). Local `storage/certificates` must be a persistent volume.

---

## 4. UI / UX improvements

- **Registration message is misleading**: after sign-up the toast says "Your student account is ready" but every portal feature is locked until approval. Show a clear *Pending approval* screen with expected time + contact, and email the student on approve/reject.
- **Add** "Forgot password?", show/hide password, strength meter, Turnstile on register/login.
- **Server errors appear only as toasts** on login/register; also show them inline (`role="alert"`) and move focus to the first invalid field or the error summary (accessibility, WCAG 2.2).
- **Admin dashboard for each role**: a receptionist should land on *Today's follow-ups / new inquiries*, an instructor on *My batches today*, an accountant on *Dues*. Currently one shared dashboard.
- **Tables**: saved filters, bulk actions across modules, column chooser, and export (Excel) for leads/students/certificates.
- **Student portal home**: next class, pending assignments, fee due, certificate status in one glance, mobile first (most students use phones).
- **Nepali language** option for public pages and student portal (at least labels), Nepali phone-friendly inputs, and BS calendar for notices.
- **Public site**: add Google reviews/YouTube embeds lazily, course comparison, "Book a free demo class" CTA with date picker, WhatsApp button already exists — track its clicks as a lead source.
- **Empty/loading/error states** are present in places (`loading.tsx`, `error.tsx`) — extend to every admin list and add optimistic UI for status changes.
- Verify colour contrast and 44px touch targets on mobile (not checked here).

---

## 5. Suggested roadmap

**Week 1 — Security & integrity (≈3–5 days)**
1. S1 trusted-proxy fix, S2 block/limit direct sign-in endpoint, S3 Turnstile + email verification on register, S4 forgot-password.
2. B2 counter table for certificate/student numbers; B3 conditional status updates.
3. Enforce CSP; add 2FA for SUPER_ADMIN/ADMIN.

**Weeks 2–3 — Make enrollment real**
4. B1 batch ↔ enrollment ↔ seats; B6 REJECTED status; B5 staff-side admission + lead conversion; B4 single student ID.
5. Add INSTRUCTOR / ACCOUNTANT / RECEPTION roles and permission rows.

**Weeks 4–6 — Money & classroom**
6. Fees, invoices, payments, receipts, due list (cash first, then eSewa/Khalti).
7. Attendance + certificate eligibility rules.
8. Student/parent notifications (email + SMS).

**Weeks 7–10 — Insight & growth**
9. Reports dashboard + Excel exports, follow-up reminders, timetable, exams/results, placement records.
10. Tests (Vitest/Playwright), backups, monitoring, privacy policy.

---

## 6. What I could not check

Prisma schema (indexes, cascade rules), `next.config` headers, `.env` handling, package versions/vulnerabilities (`npm audit`), the seed script, and runtime behaviour. Send `prisma/schema.prisma`, `next.config.mjs` and `package.json` and I can extend this audit to data model, headers and dependencies.
