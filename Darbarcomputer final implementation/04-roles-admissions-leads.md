# 04 — Roles, Admissions, Lead Conversion, Export, Reminders

Needs: migration A1 (roles), A6 (lead fields), B1 (student fields).

---

## 1. New roles and permission matrix
**File:** `src/server/permissions.ts` (the `satisfies Record<string, readonly Role[]>` will force you to update every row).

| Role | Purpose | Sees |
|---|---|---|
| SUPER_ADMIN | Owner/technical | everything |
| ADMIN | Director/manager | everything except user management |
| RECEPTION | Front desk | leads, admissions, student list (no DOB/ID), attendance view, fee *receipt* only |
| COUNSELOR | Admissions counselor | leads (own + unassigned), admissions, contact messages |
| ACCOUNTANT | Fees | invoices, payments, dues, reports (no leads notes) |
| INSTRUCTOR | Teacher | **own batches only**: students, attendance, assignments, exams |
| EDITOR | Website content | content only |
| STUDENT | Portal | own data |

New permission keys (examples; add to `PERMISSIONS`):
```ts
"student.create":   ["SUPER_ADMIN","ADMIN","RECEPTION","COUNSELOR"],
"student.edit":     ["SUPER_ADMIN","ADMIN","RECEPTION"],
"enrollment.manage":["SUPER_ADMIN","ADMIN","RECEPTION","COUNSELOR"],
"lead.convert":     ["SUPER_ADMIN","ADMIN","RECEPTION","COUNSELOR"],
"fee.read":         ["SUPER_ADMIN","ADMIN","ACCOUNTANT","RECEPTION"],
"fee.write":        ["SUPER_ADMIN","ADMIN","ACCOUNTANT"],
"payment.record":   ["SUPER_ADMIN","ADMIN","ACCOUNTANT","RECEPTION"],
"payment.void":     ["SUPER_ADMIN","ADMIN"],
"attendance.read":  ["SUPER_ADMIN","ADMIN","RECEPTION","INSTRUCTOR"],
"attendance.write": ["SUPER_ADMIN","ADMIN","INSTRUCTOR"],
"exam.write":       ["SUPER_ADMIN","ADMIN","INSTRUCTOR"],
"report.view":      ["SUPER_ADMIN","ADMIN","ACCOUNTANT"],
```
Update existing: `dashboard.view` += RECEPTION/ACCOUNTANT/INSTRUCTOR; `student.read` += RECEPTION/INSTRUCTOR; `assignment.read/write` += INSTRUCTOR (replace EDITOR for review); `batch.read` += INSTRUCTOR/RECEPTION.

**Row-level scope for INSTRUCTOR** — permissions alone are not enough. Add helper in `server/session.ts`:
```ts
export async function requireBatchAccess(batchId: string) {
  const user = await requirePermission("attendance.read");
  if (user.role === "INSTRUCTOR") {
    const b = await db.batch.findFirst({ where: { id: batchId, instructorId: user.id }, select: { id: true } });
    if (!b) throw Object.assign(new Error("FORBIDDEN: not your batch"), { code: "FORBIDDEN" });
  }
  return user;
}
```
Use it in every attendance/exam/assignment action and DAL query (`where: { batch: { instructorId } }` for list pages).

Other places to update: `layout.tsx` (`dashboard.view` check), `AdminSidebar.tsx` (menu per permission), `UsersTable`/`users.ts` validators (role enum), `lib/validators/users.ts`, `student-session.ts` (staff are not STUDENT), `login` actions (`can(user.role,"dashboard.view")` already generic), e2e seed (`seed-test.ts` add one user per role).

**Role-based landing** (doc 08 §2): RECEPTION → "Today", ACCOUNTANT → "Dues", INSTRUCTOR → "My batches".

---

## 2. Staff-side admission ("Admit student")
**New:** `server/actions/admission.ts`, `server/dal/admission.ts`, page `/techdarbar/students/new`, component `AdmissionForm.tsx`.

Flow (one screen, 3 steps): **Student → Course & batch → Fees**
1. Student details: name, phone (normalised), email (optional), DOB, address, guardian, emergency contact, photo (optional).
2. Course + batch (select shows seats left) + start date.
3. Fee plan: total (default `Course.feeNPR`), discount + reason, instalments (doc 05) → creates invoice. May be skipped until doc 05 ships.

Server action pseudo-code:
```ts
export async function admitStudentAction(input: unknown) {
  const user = await requirePermission("student.create");
  const data = admitSchema.parse(input);
  const result = await db.$transaction(async (tx) => {
    const code = await generateStudentCode(undefined, tx);
    const u = await tx.user.create({ data: { name: data.name, email: data.email ?? `${code.toLowerCase()}@students.local`, role: "STUDENT", emailVerified: !!data.email /* staff verified in person */ }});
    await tx.studentProfile.create({ data: { userId: u.id, studentCode: code, approvalStatus: "APPROVED", admittedById: user.id, admittedAt: new Date(), /* … */ }});
    const enr = await approveEnrollmentInTx(tx, { studentId, courseId, batchId }); // B1 seat claim
    if (data.leadId) await markLeadConverted(tx, data.leadId, studentProfile.id);
    return { studentId: studentProfile.id, enrollmentId: enr.id };
  });
  await audit({ actor, action: "student.admit", entity: "StudentProfile", entityId: result.studentId });
  if (data.email) await sendPortalInvite(data.email); // password-set link, S4 flow
}
```
Design decisions:
- Students **without email** (common) can exist: portal login disabled until an email/phone is added; they still get attendance, fees, certificates. Use a synthetic non-deliverable address only if `User.email` must stay unique and required — store it clearly (`@students.local`) and never send mail to it.
- Portal access via **invite**: no password is chosen by staff; the student receives a "Set your password" link (reuse the reset token flow, longer expiry 72 h).
- Duplicate guard before creating: same normalised phone or same email → show "Possible duplicate: <name, code>" with *Use existing* / *Create anyway*.

---

## 3. Lead → Student conversion
**Files:** `server/actions/leads.ts`, `LeadDetailPanel.tsx`, `dal/leads.ts`

1. Button **"Admit this student"** on the lead (needs `lead.convert`) opens the admission form prefilled from the lead (name, phone, email, course by `courseId`, preferred batch → suggests batches with the matching `TimeSlot`).
2. `markLeadConverted(tx, leadId, studentId)`: `status = ENROLLED`, `enrolledAt = now()`, `studentId`, `LeadActivity(STATUS_CHANGE)`.
3. Block manual setting of `ENROLLED` without a student (or allow with reason "enrolled offline" → warn). Reports (doc 07) count conversions by `studentId IS NOT NULL`.
4. If a student registered on the website with the same email/phone as an open lead, show "Possible match" on both sides and let staff link them.

---

## 4. Phone normalisation (Nepal)
**New:** `src/lib/phone.ts`
```ts
/** Returns "+97798XXXXXXXX" for Nepali mobiles, "+977<area><number>" for landlines, else the cleaned input. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return d;
  if (d.startsWith("977")) return "+" + d;
  if (/^9[78]\d{8}$/.test(d)) return "+977" + d;           // mobile 97/98 + 8 digits
  if (/^0\d{8,9}$/.test(d)) return "+977" + d.slice(1);    // landline with trunk 0
  return d;
}
export const isNepaliMobile = (p: string) => /^\+9779[78]\d{8}$/.test(p);
```
Use in: `phoneSchema` (`.transform(normalizePhone)`), `createLeadFromInquiry` (store `phoneNormalized`, compare duplicates on it), admission form, student profile. Backfill script `scripts/backfill-phone.ts`: batch update `Lead.phoneNormalized`, `StudentProfile.phone`. Add unit tests for 9841234567, 984-123-4567, +977 9841234567, 01-4567890, 00977….

---

## 5. CSV / Excel export (finishes the unused `lead.export`)
**New route:** `app/api/techdarbar/leads/export/route.ts`
```ts
export async function GET(req: Request) {
  const user = await requirePermission("lead.export");            // handle redirect/forbidden → 401/403
  const filters = leadFilterSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await listLeadsForExport(filters, scopeFor(user));  // already in dal/leads.ts
  const header = ["Created","Name","Phone","Email","Course","Preferred batch","Source","Status","Assigned to","Follow-up","UTM source","UTM campaign"];
  const body = rows.map(r => [fmtDate(r.createdAt), r.fullName, r.phone, r.email ?? "", r.courseTitle ?? "", r.preferredBatch, r.source, r.status, r.assignedTo?.name ?? "", r.followUpAt ? fmtDate(r.followUpAt) : "", r.utmSource ?? "", r.utmCampaign ?? ""]);
  const csv = "﻿" + [header, ...body].map(line => line.map(csvCell).join(",")).join("\r\n");   // BOM so Excel reads Nepali text
  await audit({ actor: {id:user.id,email:user.email}, action: "lead.export", entity: "Lead", meta: { count: rows.length, filters } });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leads-${fmtDate(new Date(),{year:"numeric",month:"2-digit",day:"2-digit"})}.csv"`, "cache-control": "no-store" }});
}

/** Quotes cells and neutralises spreadsheet formulas (=, +, -, @, tab, CR). */
function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
```
Add a rate limit (e.g. 10 exports/hour/user) and a hard row cap (e.g. 20,000). The same helper powers exports for students, payments (doc 05), attendance (doc 06). For real `.xlsx` use `exceljs` in a route with the same guards.

---

## 6. Follow-up reminders
`Lead.followUpAt` exists; nothing reads it.
1. **Dashboard widget "Follow-ups due"**: leads with `followUpAt <= endOfTodayNpt` and status not in (ENROLLED, LOST, SPAM), scoped to the viewer (counselor = assigned; admin = all). Click opens the lead.
2. **Daily digest e-mail** (cron route in doc 07): to each assignee, a list of today's and overdue follow-ups.
3. **Overdue badge** in `LeadsTable` (red when `followUpAt < now`).
4. Unassigned leads older than 2 hours → notify ADMIN (SLA: "contact within 1 business day" is promised on the public form).
5. Auto-assignment option (round-robin among active COUNSELORs) in Settings.

---

## 7. Acceptance tests
- Reception can admit a student with no email; student appears APPROVED with ACTIVE enrollment and a seat taken.
- Admit from lead → lead shows ENROLLED and links to student.
- Instructor cannot open another instructor's batch (403).
- Export CSV neutralises `=cmd|…` cells; audit row written; COUNSELOR gets 403.
- `9841234567` and `+977 984-1234567` detected as duplicates.
