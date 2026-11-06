# 07 — Notifications, Scheduled Jobs & Reports

Needs: Resend already integrated (`server/services/email.ts`). Add SMS and a log table so every message is traceable and retryable.

---

## 1. Notification service
### Schema (set E)
```prisma
enum NotifyChannel { EMAIL SMS }
enum NotifyStatus  { QUEUED SENT FAILED SKIPPED }

model NotificationLog {
  id         String        @id @default(cuid())
  channel    NotifyChannel
  template   String                      // "student.approved", "fee.due", "attendance.absent" …
  toHash     String                      // sha256(salt:recipient) — never store raw phone/email here
  toMasked   String                      // "98****4567" / "r***@gmail.com" for staff troubleshooting
  studentId  String?
  status     NotifyStatus  @default(QUEUED)
  attempts   Int           @default(0)
  error      String?
  providerId String?
  createdAt  DateTime      @default(now())
  sentAt     DateTime?
  @@index([status, createdAt])
  @@index([studentId, createdAt])
}
```
### API
`server/services/notify.ts`:
```ts
export async function notify(msg: { channel: "EMAIL"|"SMS"; template: string; to: string; vars: Record<string,string>; studentId?: string; dedupeKey?: string }): Promise<void>
```
- Renders from `templates/{template}.{en,ne}.ts` (functions returning `{subject, html, text}` / `{sms}`), HTML-escapes all vars (reuse `escapeHtml`).
- `dedupeKey` (e.g. `fee.due:inv123:2083-10-05`) prevents duplicate reminders.
- Skips with status `SKIPPED` when recipient missing/opted-out; respects quiet hours (no SMS 21:00–07:00 NPT).
- Called inside Next's `after()` so a slow provider never blocks the user request (same pattern as `submitInquiry`).
- Failed sends retried by the nightly job up to 3 times.

### SMS providers (Nepal)
Implement `server/services/sms.ts` with a small adapter interface and one provider first (e.g. **Sparrow SMS** or **Aakash SMS** — both are HTTP APIs with a token and sender identity). Check the provider's current API docs, price per SMS, sender-ID approval time (needs NTA-compliant registration) and Unicode (Nepali) length limits (70 chars/segment for Unicode). Env: `SMS_PROVIDER`, `SMS_TOKEN`, `SMS_SENDER`. Never log message bodies.

### Templates to build first
| Template | Channel | Trigger |
|---|---|---|
| `student.verify-email` | email | registration (doc 01 S3) |
| `student.password-reset` | email | doc 01 S4 |
| `student.approved/rejected` | email (+SMS) | approval decision |
| `student.admitted` | SMS/email | staff admission + portal invite |
| `enrollment.approved` | email/SMS | batch + start date + room/time |
| `fee.receipt` | SMS/email | payment recorded |
| `fee.due` | SMS/email | 3 days before / on / 3 days after due date |
| `attendance.absent` | SMS (guardian) | 2 consecutive absences |
| `class.cancelled` | SMS/email | instructor/admin cancels a session |
| `exam.result` | email/portal | results published |
| `certificate.issued` | email | issue (verify link) |
| `lead.autoreply` | email | exists (`sendInquiryAutoReply`) |
| `staff.followup-digest` | email | daily 08:00 |

Each template needs English and Nepali versions; guardians' SMS in Nepali by default.

### WhatsApp
Start with **click-to-chat links** with prefilled text on lead/student/dues screens (`https://wa.me/97798XXXXXXXX?text=...`, URL-encoded). The WhatsApp Business API needs approved templates and cost — defer.

---

## 2. Scheduled jobs
Single secured route per job, called by system cron (VPS) or your host's scheduler. Authenticate with a shared secret and constant-time compare; return 401 otherwise; run in `nodejs` runtime.

```ts
// app/api/cron/[job]/route.ts
import { timingSafeEqual } from "node:crypto";
const JOBS = { daily: runDaily, hourly: runHourly } as const;
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const given = Buffer.from(req.headers.get("authorization")?.replace("Bearer ", "") ?? "");
  const want = Buffer.from(process.env.CRON_SECRET ?? "");
  if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) return new Response(null, { status: 401 });
  const { job } = await params;
  const fn = JOBS[job as keyof typeof JOBS];
  if (!fn) return new Response(null, { status: 404 });
  await fn(); return Response.json({ ok: true });
}
```
Crontab (server in Nepal time; adjust `CRON_TZ`):
```
CRON_TZ=Asia/Kathmandu
0 8 * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/daily
5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/hourly
```
**Daily (08:00):** follow-up digests (doc 04 §6) · fee reminders (due in 3 days / due today / 3 days overdue) · absent-student guardian SMS · expire stale `PaymentIntent`s · reconcile `Batch.seatsTaken` (doc 02 B1 SQL) · purge `RateLimitBucket` older than 2 days · purge leads per retention (doc 01 S13) · retry failed notifications · lock attendance sessions older than 48 h · send nightly DB-health summary to SUPER_ADMIN.
**Hourly:** unassigned-lead SLA alert (> 2 h) · pending gateway payments re-check.
Make every job **idempotent** (use `dedupeKey`) and log start/end/duration/count to stdout (picked up by monitoring, doc 09).

---

## 3. Reports (director dashboard)
Extend `server/dal/dashboard.ts`; add `/techdarbar/reports` (permission `report.view`) with date-range picker (default: current month, Asia/Kathmandu) and **Export CSV** per report (same safe CSV helper as doc 04 §5). Prefer SQL aggregates (`$queryRaw`/`groupBy`), cached per range for 5 minutes.

| Report | Definition / query sketch |
|---|---|
| Admissions per month | `count(StudentProfile) group by date_trunc('month', admittedAt)`; split by course |
| Lead funnel | counts by `LeadStatus` for leads created in range; conversion = ENROLLED/total |
| Conversion by source / campaign | group by `source`, `utmSource`, `utmCampaign` → leads, enrolled, % |
| Counselor performance | per assignee: leads, contacted < 24 h %, enrolled, avg days to enroll (`enrolledAt − createdAt`) |
| Response time | median(first `LeadActivity.createdAt − Lead.createdAt`) |
| Batch fill rate | `seatsTaken/seatsTotal` per batch; waitlist size |
| Drop-out | `DROPPED / (ACTIVE+COMPLETED+DROPPED)` per course/batch, with reasons |
| Collections | Σ `Payment` (RECEIVED) by day/month/method/received-by |
| Outstanding dues | Σ balances with aging buckets 0–7 / 8–30 / 31–60 / 60+ |
| Attendance | average % per batch; students under threshold |
| Results | pass rate, average % per exam/batch |
| Certificates | issued per month, revoked/reissued counts, verification lookups (add counter) |
| Revenue forecast | Σ unpaid installments by due month |

Dashboard cards for ADMIN: *New leads today · Follow-ups due · Pending approvals · Collections today · Dues overdue · Batches starting in 14 days · Low-attendance students*. Each card links to the filtered list.

**Marketing attribution tip:** store UTM on the student at conversion (copy from lead) so you can compute *cost per admission* by joining ad spend (manual monthly entry into a small `MarketingSpend(month, channel, amountNPR)` table).

---

## 4. Acceptance tests
- A failed SMS provider call is logged `FAILED`, retried, and never breaks the originating request.
- Duplicate cron execution sends each reminder once (`dedupeKey`).
- Cron endpoint returns 401 without/with wrong secret.
- Report totals equal the sum of the underlying rows for a fixed fixture month.
