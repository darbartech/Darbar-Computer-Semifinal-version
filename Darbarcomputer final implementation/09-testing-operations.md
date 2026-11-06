# 09 — Testing, CI, Operations & Go-Live

You already have Playwright e2e fixtures (`prisma/seed-test.ts` → `e2e/helpers.ts`, one user per role, production guard). Build on that.

---

## 1. Test pyramid
| Layer | Tool | Scope |
|---|---|---|
| Unit | **Vitest** | pure logic: permissions, phone, grading, eligibility, money, CSV escaping, IP extraction |
| Integration | Vitest + real Postgres (`docker compose` test DB, `prisma migrate deploy`) | DAL/transactions: counters, seats, payments, state transitions |
| E2E | **Playwright** (+ `@axe-core/playwright`) | critical user journeys |
| Load (smoke) | `k6` or `autocannon` | public pages, inquiry form, verify page |

Never mock the database for concurrency tests — mocks hide the races you are fixing.

## 2. Must-have tests (map to findings)
**Unit**
- `permissions`: snapshot of the whole matrix; for each new permission assert *denied* roles (STUDENT never has any; INSTRUCTOR has no `fee.*`, `lead.*`, `settings.*`).
- `clientIpFromHeaders`: spoofed `cf-connecting-ip` ignored in hops mode; right-most hop logic; missing header → bucket "unidentified". (S1)
- `normalizePhone`: 9841234567, 984-123-4567, +977 9841234567, 977…, 01-4567890. (B8)
- `csvCell`: `=1+1`, `+cmd`, `-2`, `@SUM`, quotes, newlines. (B7)
- `grading`, `eligibility` thresholds at boundary (74.9 / 75.0 %). 
- `fees`: balance, status derivation, overpayment rejected, discount constraint.

**Integration (parallel)**
- 50 parallel `generateCertificateNumber()` → 50 unique, consecutive numbers. (B2)
- 20 parallel registrations → no failures, unique `studentCode`s. (B2)
- Batch with 1 seat, 5 parallel approvals → exactly 1 succeeds; seatsTaken = 1; CHECK constraint never violated. (B1)
- Double-click issue → one ISSUED, other gets "already issued". (B3)
- 10 parallel payments for one invoice summing > balance → total never exceeds net. (doc 05)
- Rate limiter: 20 parallel `allow()` with max 5 → exactly 5 true. (S8)

**E2E (Playwright)**
1. Public inquiry → lead appears for COUNSELOR → follow-up set → convert to student → enrollment ACTIVE with seat.
2. Student register → verify email (Mailpit/MailHog or capture Resend in test mode) → pending page → admin approves → student sees courses.
3. Forgot password end-to-end; reply identical for unknown email.
4. Direct `POST /api/auth/sign-in/email` → 404. (S2)
5. ADMIN without 2FA redirected to setup; with 2FA signs in via TOTP (use `otplib` in test). (S6)
6. Instructor takes attendance; other instructor gets 403.
7. Accountant records payment, prints receipt, voids with reason; student sees updated balance.
8. Issue certificate → public verify by QR token valid; by number alone → not found; revoke → "Revoked" state.
9. Role matrix smoke: for each role visit every admin URL → expected 200/redirect/403 (generated from `PERMISSIONS`).
10. axe scan of key pages.

## 3. CI pipeline (GitHub Actions or similar)
```
on: pull_request, push main
jobs:
  verify:   npm ci → prisma generate → typecheck → lint → vitest (unit + integration w/ postgres service)
  e2e:      build → prisma migrate deploy → seed-test → playwright (retries 1, trace on failure)
  security: npm audit --omit=dev (fail on high), gitleaks (secrets), `prisma migrate diff --exit-code` (schema drift)
  deploy:   (main only, after green) → backup DB → migrate deploy → restart → smoke test /api/health
```
Branch protection: PR required, CI green, one reviewer (or self-review checklist when solo). Use Dependabot/Renovate weekly.

## 4. Environment & secrets checklist
Extend `lib/env.ts` so production **refuses to boot** without: `DATABASE_URL`, `AUTH_SECRET` (≥32), `NEXT_PUBLIC_SITE_URL` (https), `TURNSTILE_*`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `TRUSTED_PROXY(_HOPS)`, `CLOUDINARY_*` (or explicit local-storage ack), and SMS/payment keys when those features are enabled. Warn if `MEDIA_STORAGE_PROVIDER=local` in production.
Secrets live in the host's secret store / `.env` with `chmod 600`, never in git; rotate `AUTH_SECRET` only with a planned logout of everyone.

## 5. Backups & recovery (non-negotiable)
- **Daily** `pg_dump -Fc` at 02:00 NPT → compressed + encrypted (`age`/`gpg`) → copied offsite (Backblaze B2 / S3 / another VPS) → keep 14 daily, 8 weekly, 6 monthly.
- Also back up `storage/certificates` (or confirm it is regenerated deterministically) and `public/uploads` if local storage is used.
- **Restore drill every month** into a scratch DB; record the time it took. A backup never restored is not a backup.
- Document RPO/RTO (e.g., lose ≤ 24 h of data; back online in ≤ 4 h). Consider Postgres WAL archiving/managed Postgres with PITR once fees go live (money data!).
- Persistent volume for `storage/` in Docker (`volumes:`), otherwise redeploys wipe PDFs.

Sample script `scripts/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
d=$(date +%F); f="/var/backups/darbar/db-$d.dump"
pg_dump -Fc "$DATABASE_URL" -f "$f"
age -r "$AGE_PUBLIC_KEY" -o "$f.age" "$f" && rm "$f"
rclone copy "$f.age" remote:darbar-backups/
find /var/backups/darbar -name '*.age' -mtime +14 -delete
curl -fsS "$HEALTHCHECK_PING_URL" >/dev/null   # dead-man's switch (healthchecks.io)
```

## 6. Monitoring & logging
- `/api/health` (DB `SELECT 1`, app version, migration count) for uptime monitors (UptimeRobot/BetterStack) with SMS/e-mail alert.
- Error tracking: Sentry (scrub PII; set `sendDefaultPii:false`; drop request bodies for server actions).
- Structured logs (JSON: time, level, event, requestId) — keep the existing "no PII in logs" rule; ship to a file with logrotate or a log service.
- Alerts: 5xx rate, failed notification rate, cron job not run in 26 h, DB disk > 80 %, certificate PDF generation failures, repeated login failures (S5).
- Audit log retention: keep ≥ 2 years; make `AuditLog` append-only at DB level (revoke UPDATE/DELETE for the app role on that table).

## 7. Hardening of the deployment
- App DB role with least privilege (no `CREATE`/superuser); separate role for migrations.
- Caddy/Nginx: HTTPS only, HSTS, strip inbound `CF-Connecting-IP`/`X-Forwarded-*` from clients (S1), request size limit, gzip/brotli, rate-limit `/api/*` at proxy as a second layer.
- OS: unattended security updates, firewall allowing only 80/443/SSH(key-only, non-default port or VPN), fail2ban.
- Run Node as non-root, read-only filesystem except `storage/`, `public/uploads`, tmp.
- Dependency hygiene: pin Node LTS, lockfile committed, weekly audit.

## 8. Performance sanity
- Seed realistic volume (5k leads, 2k students, 50 batches, 20k attendance rows, 10k payments) and `EXPLAIN ANALYZE` the dashboard/report queries.
- Public pages are cached via `cached()` + tags — verify invalidation after each new write path (batches/seats/fees do not leak into public caches).
- Certificate PDF generation: measure p95; queue bulk jobs, 3–5 concurrent max.

## 9. Go-live checklist
**Security**
- [ ] S1–S8 done; direct auth API blocked; rate-limits verified through the real proxy.
- [ ] 2FA enforced for ADMIN/SUPER_ADMIN; seed placeholder passwords impossible.
- [ ] CSP enforced; HSTS on; cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] `npm audit` clean (no high/critical); secrets scan clean.
**Data**
- [ ] Migration sets applied on a copy of production first; counters seeded; CHECK constraints pass.
- [ ] Backup + restore drill completed; offsite copy verified.
**Function**
- [ ] E2E suite green on the release commit; role matrix verified manually once.
- [ ] Email deliverability: SPF, DKIM, DMARC for the sending domain; Resend domain verified.
- [ ] SMS sender ID approved; test messages received on Ncell and NTC numbers.
- [ ] Payment gateway sandbox → production credentials, callback URLs whitelisted.
**Business**
- [ ] Privacy policy & terms published; consent text on forms.
- [ ] Staff trained per role (30-minute session + one-page cheat sheet each); super-admin runbook written (reset 2FA, restore backup, rotate secrets).
- [ ] Rollback plan: previous build kept; DB restore procedure tested.
- [ ] 2-week hypercare: daily check of errors, failed notifications, cron runs, payment reconciliation.

## 10. Suggested sprint plan (solo developer, ~10 weeks)
| Sprint | Deliverables |
|---|---|
| 1 (wk 1) | S1, S2, S8, S5, B2, B3 + tests + backups + CI |
| 2 (wk 2) | S3, S4, S6, S7, B1, B6, A-migrations, role enum |
| 3 (wk 3) | Roles/permissions, admission form, lead conversion, phone normalisation, export |
| 4–5 (wk 4–5) | Fees core (invoice/payment/receipt/dues), accountant UI |
| 6 (wk 6) | Timetable + attendance (mobile) |
| 7 (wk 7) | Exams/results + eligibility + bulk certificate drafts |
| 8 (wk 8) | Notifications (email+SMS), cron jobs |
| 9 (wk 9) | Reports + dashboards per role, online payment sandbox |
| 10 (wk 10) | UX polish, Nepali/BS, accessibility pass, load test, go-live |
