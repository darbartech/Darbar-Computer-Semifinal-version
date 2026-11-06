# 08 — Security, Testing & Deployment

Checklists and ready-to-adapt configs for going from "works on my machine" to a safe production launch.

---

## 1. Security checklist

### Authentication & sessions
- [ ] Public sign-up disabled; users created only by SUPER_ADMIN or seed.
- [ ] Passwords hashed by the auth library (never roll your own); minimum 10 characters; no password in logs or seed files committed to git.
- [ ] Login: rate limit per IP + per email; generic error ("Email or password is incorrect").
- [ ] Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, sensible expiry (e.g. 7 days sliding), rotated on login.
- [ ] Deactivated user (`isActive=false`) is rejected on **every** request, not only at login.
- [x] Two-factor (TOTP) **required** for SUPER_ADMIN / ADMIN / ACCOUNTANT / RECEPTION — see "Two-factor for staff" below.
- [ ] Always ≥ 1 active SUPER_ADMIN (enforced in code).

### Two-factor for staff

Roles that move money or issue certificates cannot open the admin area on a password alone:
`SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` and `RECEPTION` (`TWO_FACTOR_REQUIRED_ROLES` in
`src/lib/validators/users.ts`, read by both `src/server/session.ts` and the staff directory so
the two sides cannot drift). RECEPTION is in the list because it holds `payment.record` — it
writes the receipts an invoice balance is computed from — and the counter is the least
controlled keyboard in the building. `COUNSELOR`, `INSTRUCTOR` and `EDITOR` are not gated but
see the same enrolment card and may opt in.

- The Better Auth `twoFactor` plugin is mounted in `src/server/auth.ts`, ahead of
  `nextCookies()`. Enrolment is `auth.api.enableTwoFactor` / `verifyTOTP`, and both are
  reached only from `src/server/actions/two-factor.ts` — `/api/auth/two-factor/*` stays
  behind the allow-list in `src/app/api/auth/[...all]/route.ts` and answers 404.
- Enforcement lives in `requireUser()` (`src/server/session.ts`): a gated role with
  `twoFactorEnabled = false` is redirected to `/techdarbar/account` until it enrols. The
  account page and the admin chrome use the ungated `requireSessionUser()`, which is what
  keeps that redirect from looping. Every other admin page and Server Action inherits the gate.
- At the door, `signInWithPassword` returns `secondFactor: true` and the login form shows a
  code step (authenticator code or a backup code). Throttling is the existing
  `createSigninGuard` under the `staff-2fa` namespace, so a mistyped code never spends the
  five wrong-password attempts. Better Auth adds two limits of its own: five codes per
  challenge and a 15-minute account lock after five consecutive failures. Every refused code
  writes an `auth.2fa.verificationFailed` audit row (hashed account + hashed IP only).
- Secrets in the `TwoFactor` table are encrypted with `AUTH_SECRET`. **Changing or losing
  `AUTH_SECRET` invalidates every enrolled authenticator** — treat it as a 2FA-wide outage.

**Step-up: the second factor again at the moment of the click**

A session proves a code was right when the person sat down. The writes that undo money, hand
over a certificate, or take over an account ask for a fresh code when the button is pressed, so
a session copied out of a browser is not enough — the attacker still needs the phone.

- One check: `requireStepUp(user, purpose, input)` in `src/server/services/step-up.ts`. It reads
  `stepUpCode` / `stepUpMethod` out of the payload the action already has — they are deliberately
  **not** part of the business schemas, so forgetting to pass a code can only ever mean a
  refusal, never a silent `undefined` slipping past a `.optional()`.
- The purposes (`STEP_UP_PURPOSES`, never free text) and where each is enforced:
  `payment.void` and `invoice.void` (`src/server/actions/fees.ts`), `certificate.issue`,
  `certificate.revoke` and `certificate.reissue`
  (`src/server/actions/certificates/certificates.actions.ts`),
  `user.identity` (only when a role or an email actually moves — a name edit stays one click),
  `user.create.privileged` (creating a staff account whose role needs 2FA: the four gated roles;
  a COUNSELOR/INSTRUCTOR/EDITOR account is one click), `user.active` (**both** directions — an
  attacker who can switch a dormant account on can use it), `user.password.reset`,
  `user.2fa.reset` and `user.delete` (`src/server/actions/users.ts`), `day.reopen`
  (`src/server/actions/fees.ts` — closing a day stays one click, opening it again is what lets
  receipts be added after the count), `settings.sensitive`
  (`src/server/actions/settings.ts`) and `2fa.disable` (turning off your own second factor).
- Two of these are conditional, so the box only appears when the write actually does something:
  `user.identity` compares the stored role and e-mail, and `settings.sensitive` compares the
  stored row against the incoming value field by field. `SETTINGS_SENSITIVE_FIELDS` in
  `src/lib/validators/settings.ts` lists which fields of which tab count — the fee limits
  (`maxBackdateDays`, `discountApprovalThresholdPct`, `lateFeePerWeek`, `allowedDueAmount`,
  `certificateRequiresClearance`, `currency`) and the site URL; the cosmetic tabs (contact text,
  socials, stats, hero) stay one click. A settings tab that has never been saved counts as
  sensitive, because its defaults are being replaced. The action answers such a refusal with
  `requiresStepUp: true` so the panel can open the code box even when the client thought nothing
  had changed.
- `resetUserPasswordAction` no longer accepts a password the admin types. A staff password the
  administrator knows is a credential shared with whoever set it, so the action now asks for a
  fresh code (purpose `user.password.reset`), calls
  `auth.api.requestPasswordReset({ email, redirectTo: "/techdarbar/reset-password" })` so the
  account holder picks their own password through the same forgot-password link the public site
  uses, revokes the account's sessions, and audits `user.password_reset` with
  `meta: { via: "admin" }` — no address, no token. The token itself belongs to Better Auth (30
  minutes, single use) and its own per-IP limit; a call that hits that limit answers "Too many
  reset links were sent just now" and revokes nothing, so an onboarding run cannot look like a
  failure that partially applied.
- Better Auth does the verification (`verifyTOTP` / `verifyBackupCode` read the current session
  and check against that user's own secret). Around it the check adds: the same
  `staff-2fa` throttle budget as a wrong code at the door, an `auth.2fa.stepUp` audit row with
  `meta: { purpose, method }`, and one fixed sentence per refusal. **No code is ever logged** —
  not to stdout, not in `meta`.
- An empty box is refused before the budget is touched (`STEP_UP_REQUIRED`); an account with no
  second factor is refused with `STEP_UP_NOT_ENROLLED`, which only happens if the matrix is ever
  widened, since every role holding these permissions is gated.
- The UI is one control (`src/components/admin/StepUpFields.tsx`: code box + "use a backup code"
  switch) embedded in the void/issue dialogs, the day-reopen row in
  `src/components/admin/fees/DayCloseControls.tsx` and the settings tabs that can turn a
  sensitive field on, and one standalone dialog (`src/components/admin/StepUpDialog.tsx`) for the
  row buttons in the staff directory that have no form of their own. All of them know which
  roles (`TWO_FACTOR_REQUIRED_ROLES`) and which fields (`SETTINGS_SENSITIVE_FIELDS`) need a code,
  because both lists live in `src/lib/validators/*` and the server reads the same exports.
  Every one clears the box after each attempt: a code is good for one 30-second window.

**Recovery when a staff member cannot produce a code**

1. Any SUPER_ADMIN opens `/techdarbar/users`, finds the row, and presses the shield icon
   under Actions ("Reset two-factor"). The dialog asks for *their own* fresh code first
   (purpose `user.2fa.reset`), so a stolen admin session cannot disarm a colleague. The reset
   deletes the secret and the backup codes, sets `twoFactorEnabled = false` and revokes that
   account's sessions. It is audited as `user.resetTwoFactor`; a super administrator cannot use
   it on their own row — that is the account page's job.
2. The person signs in with their password and enrols a new authenticator from
   *My account*. If they still hold an unused backup code they can sign in with that instead,
   under "Lost the app? Use a backup code".
3. **The last active SUPER_ADMIN** (nobody else can reset them): stop the app, then against
   the production database

   ```sql
   BEGIN;
   DELETE FROM "TwoFactor" WHERE "userId" = '<user-id>';
   UPDATE "User" SET "twoFactorEnabled" = false WHERE "id" = '<user-id>';
   DELETE FROM "Session" WHERE "userId" = '<user-id>';
   COMMIT;
   ```

   Restart the app and sign in with the password; the account page will ask for a fresh
   authenticator. Keep the `<user-id>` from `SELECT id, email FROM "User" WHERE role = 'SUPER_ADMIN';`
   and record the change in the incident log — it is the one 2FA action that leaves no audit row,
   because the audit trail is itself behind the gate.

### Authorisation
- [ ] **Every** Server Action and DAL write calls `requirePermission(...)` as its first line. (Server Actions are public HTTP endpoints.)
- [ ] `proxy.ts` and layouts redirect, but are **not** relied on for security.
- [ ] Counselor lead scoping enforced in the DAL query.
- [ ] Instructor batch scoping enforced in the DAL query (`src/server/dal/scope.ts`): a
      student, batch, roster row, assignment or submission outside the teacher's own
      batches does not match their read — an out-of-scope `?id=` renders as "not found",
      not as a 403 that confirms the id exists. Writing is narrower still: an
      INSTRUCTOR may edit only assignments they created, and may review any link
      handed in by a student of their batch.
- [ ] A teacher's student view carries name, code, photo and class list only. Phone,
      email, date of birth and address go to the roles that edit or enrol the record
      (`seesStudentPii`), and the DAL returns them as `null` so a page cannot forget
      to hide them.
- [ ] Unit test iterates over `PERMISSIONS` and asserts each role's allowed/denied actions.
- [ ] IDs from the client are always re-checked against the database (never trust `courseId` etc. blindly).

### Input & output
- [ ] Every action/form parses input with Zod; unknown fields are stripped.
- [ ] Prisma only (no string-built SQL). If raw SQL is needed for dashboards, use tagged `Prisma.sql` parameters.
- [ ] Markdown rendered with `rehype-sanitize`; **no** raw HTML / `dangerouslySetInnerHTML` from DB content. (The existing `dangerouslySetInnerHTML` for JSON-LD is fine **only** because it uses `JSON.stringify` of structured data — escape `<` as `\u003c` for DB-sourced strings.)
- [ ] The `mapEmbed` iframe string in `institute.ts` must **not** become an editable HTML setting. Store only a `mapQuery`/embed URL and build the iframe in code.
- [ ] External links from user content get `rel="noopener noreferrer"`.

### Uploads
- [ ] Signed uploads only; server enforces allowed MIME (`image/jpeg|png|webp|avif`), max size (e.g. 5 MB), folder allow-list.
- [ ] Both upload routes gate first and read second: `requirePermission("media.upload")`
      and the rate limit run before `request.json()` / `request.formData()`, so a
      caller who is about to be refused cannot make the server parse a payload —
      and an anonymous one cannot make it buffer a whole file.
- [ ] No SVG uploads from editors (script risk) — or sanitise.
- [ ] Alt text required on every image.

### Public forms
- [ ] Honeypot + Cloudflare Turnstile + DB rate limit (5/hour/IP hash) + max field lengths.
- [ ] No raw IP stored (salted hash only). Consent checkbox and timestamp.
- [ ] Email notifications escape user text (no HTML injection into staff emails).

### Platform
- [ ] Security headers in `next.config.mjs`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (admin) / `frame-ancestors`, `Permissions-Policy`, HSTS (at proxy).
- [ ] CSP is **enforced**, not report-only, and has exactly one owner: `src/lib/csp.ts` builds it, `src/proxy.ts` delivers it (two `Content-Security-Policy` headers would be enforced as their intersection, so it must not also appear in `next.config.mjs`). Two policies, split by path (`usesNoncePolicy`): `/techdarbar` and `/student` get `script-src 'self' 'nonce-…'`, everything else gets `script-src 'self' 'unsafe-inline'`. Consequences to remember: the nonce'd subtrees declare `export const dynamic = "force-dynamic"` in their own layouts (`src/app/techdarbar/layout.tsx`, `src/app/(public)/student/layout.tsx`) because a nonce only reaches Next's own scripts in a document that is rendered per request; the public site is prerendered/ISR (`revalidate = 300` in `src/app/(public)/layout.tsx`, `generateStaticParams` on the `[slug]` pages) and refreshes on admin writes through `invalidate(...)` → `updateTag`; JSON-LD needs no nonce and must not read `headers()` (`<script type="application/ld+json">` is never executed, so `script-src` is never consulted — reading the nonce instead would force every page that uses it dynamic); and `general.siteUrl` must match the origin people actually browse with — media stored as absolute URLs is `img-src 'self'`-blocked otherwise.
- [ ] Violations from the enforced policy land on `POST /api/csp-report`, which understands both the legacy `{"csp-report": {…-uri…}}` body and the Reporting API array (`src/server/services/csp-report.ts`). A log line naming a directive you did not expect is a live defect, not noise.
- [ ] Error monitoring (`docs/08 §5`) sends nothing until `ERROR_REPORT_ENDPOINT` is configured, and scrubs the payload **in this repository before it leaves**: an exception message on this site can contain an email address, a phone number or a 2FA code, because form text ends up in messages and `requireStepUp` reads the code from the same submitted object. The browser half posts to our own `/api/error-report` so the collector's URL and credential never enter the client bundle and `connect-src 'self'` keeps holding.
- [ ] `robots.ts` disallows `/techdarbar`, `/student` and `/api` for every agent; admin,
      student and `/verify` pages send `noindex`, and none of them is listed in the
      sitemap. `/_next/` and `/.next/` are **not** disallowed
      (fix guide §6) — blocking them stops Googlebot rendering the pages it is indexing.
      The admin URL is not a secret and not the protection; auth and 2FA are.
      `/verify` is reachable but unindexable on purpose: a QR code has to be scannable,
      while a certificate URL is not something a search should surface. No `host`
      directive — the canonical origin belongs to `general.siteUrl` and to each page's
      `alternates.canonical`, not to a third place that can disagree.
      `tests/seo.test.ts` checks all of it from source, including that no public page
      builds metadata without a `path` (which would canonicalise it to `/`) and that
      `lastmod` only ever comes from a record's `updatedAt`.
- [ ] Secrets only in environment variables / host secret store; `.env*` git-ignored (already true); rotate if ever exposed.
- [ ] Dependencies: `npm audit` in CI, Dependabot/Renovate enabled; lockfile committed.
- [ ] Database: dedicated app user with least privilege (no superuser); not exposed to the public internet (private network or IP allow-list); TLS enabled.
- [ ] Backups encrypted and stored off the server.

### Privacy
- [ ] Privacy notice linked from every form — still open: there is no `/privacy` page in this build, so the
      forms link nothing yet.
- [x] **Retention period** for leads and contact messages, enforced by a scheduled job: see §5 "Data retention".
- [x] **Data requests** — a student's whole record as one JSON file, and an erase that takes the identity out
      of it and leaves the ledger: see §5 "Student data requests".
- [ ] Testimonial/gallery photos: written consent recorded (`consentGiven` + note).
- [ ] Confirm the legal requirements for storing personal data in Nepal with someone qualified; this document is not legal advice.

---

## 2. Testing plan

| Level | Tool | What to cover | Run |
|-------|------|---------------|-----|
| Unit | Vitest | Zod validators (valid/invalid/Nepali names), mappers (`toCourseView` snapshot), slugify, `PERMISSIONS` matrix, formatters, UI/UX source contracts (`tests/ui-ux-contracts.test.ts`), SEO source contracts (`tests/seo.test.ts`), error-report scrubbing and its wiring (`tests/error-report.test.ts`, `tests/monitoring-services.test.ts`), the data-retention sweep against a fake Prisma (`tests/retention.test.ts`), the student export and erase the same way (`tests/student-privacy.test.ts`) | every commit |
| Integration | Vitest + real Postgres (docker service) | DAL queries: visibility (draft hidden), counselor scoping, unique slug conflict, cascade rules | every PR |
| End-to-end | Playwright | (1) visitor submits inquiry → staff sees lead; (2) admin edits course fee → public page updates; (3) archived course → 404; (4) EDITOR can't open `/admin/leads` and action call is rejected; (5) login/logout; (6) contact form spam honeypot; (7) mobile viewport smoke | PR + before deploy |
| Accessibility | Playwright (`e2e/accessibility.spec.ts`) | first Tab reaches the skip link and activating it lands inside `<main>`; no tab stop is invisible when focused; the confirm dialog keeps Tab inside itself; reduced motion leaves no copy transparent. Public pages, `/student/login`, admin (seeded session) | PR |
| Performance | Lighthouse CI | `/`, `/courses`, `/courses/[slug]` — scores not lower than the pre-migration baseline (record baseline in Phase 0) | weekly / release |
| Manual UAT | Checklist | Staff perform real tasks: add a course, publish a post, handle a lead | before go-live |

Test data: a `prisma/seed-test.ts` creating one user per role + sample leads. It refuses to run
unless **both** `NODE_ENV !== "production"` and the explicit opt-in are present
(`ALLOW_E2E_SEED=1`, or `--allow-e2e-seed`, which is what `npm run db:seed:test` passes) — see
`prisma/seed-guard.ts` and `docs/SECURITY-CLEANUP.md`. The fixture accounts share a password
that is published in this repository, so they must never exist on a database anyone signs into
for real. Set `ALLOW_E2E_SEED=1` in the CI e2e job's `env`, not in a committed file.

---

## 3. CI pipeline — `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: darbar, POSTGRES_PASSWORD: darbar, POSTGRES_DB: darbar_test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U darbar" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://darbar:darbar@localhost:5432/darbar_test
      AUTH_SECRET: ci-only-secret
      NEXT_PUBLIC_SITE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm audit --audit-level=high
```
Add a separate job (or manual workflow) for Playwright e2e and one that runs `prisma migrate deploy` against production **only on tagged releases**, after a backup step.

---

## 4. Deployment options

Pick **one**. Check each provider's *current* pricing, plan limits and commercial-use terms before committing — they change.

| | **Option A — Managed platform** | **Option B — Single VPS (Docker)** |
|---|---|---|
| App hosting | Vercel (or similar) | One Linux VPS running the Next.js container |
| Database | Managed Postgres (Neon, Supabase, Railway, AWS RDS…) | Postgres container on the same VPS, or managed DB |
| Effort | Lowest: git push = deploy, previews per PR | Medium: you manage updates, TLS, backups |
| Cost shape | Usage/seat-based; may need a paid plan for commercial use | Predictable monthly VPS fee |
| Risk | Vendor limits; serverless DB connection limits (use pooling) | You own security patches & uptime |
| Good when | Small team, fast launch | Tight budget, want full control, steady traffic |

**Region:** choose a region close to your visitors (South Asia — e.g. Mumbai or Singapore) for both app and database; keep them in the **same** region to avoid slow queries.

### Option A notes
- Set all env vars in the platform dashboard; run `prisma migrate deploy` in the build or release step.
- Use the database provider's **connection pooler** URL for the app (serverless creates many short connections) and the direct URL for migrations.
- Preview deployments must use a **separate database** (never production).

### Option B — files

`next.config.mjs` (add): `output: "standalone"`

`Dockerfile`
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```
`docker-compose.prod.yml`
```yaml
services:
  db:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_USER: darbar
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: darbar
    volumes: [pgdata:/var/lib/postgresql/data]
    # no published port → reachable only inside the compose network
  app:
    build: .
    restart: always
    env_file: .env.production
    depends_on: [db]
  caddy:
    image: caddy:2
    restart: always
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy_data:/data]
volumes: { pgdata: {}, caddy_data: {} }
```
`Caddyfile` (automatic HTTPS)
```
yourdomain.com, www.yourdomain.com {
  encode gzip zstd
  reverse_proxy app:3000
}
```
Deploy flow: `git pull` → `docker compose -f docker-compose.prod.yml build app` → `docker compose run --rm app npx prisma migrate deploy` → `docker compose up -d app`. 🔎 The standalone image needs the Prisma CLI available for `migrate deploy` — run migrations from the build stage image or a dedicated "migrate" service.

Server hygiene: non-root user, SSH keys only, firewall (22/80/443), unattended security upgrades, fail2ban.

---

## 5. Backups, monitoring, operations

**Backups**
```bash
# daily at 02:00 — /etc/cron.d/darbar-backup
0 2 * * * root docker exec darbar-db pg_dump -U darbar -Fc darbar > /backups/darbar_$(date +\%F).dump \
          && find /backups -name 'darbar_*.dump' -mtime +14 -delete
```
- Copy dumps **off the server** (object storage / another machine), encrypted.
- Managed DB: enable point-in-time recovery / automatic backups.
- **Restore drill:** once before launch and then quarterly — restore into a scratch database and open the site against it. A backup you've never restored is not a backup.
- Media (Cloudinary) is stored outside the DB; keep a note of how to export it.

**Scheduled housekeeping** — `POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET`, once a day:

```bash
# 08:00 Asia/Kathmandu — /etc/cron.d/darbar-janitor
0 8 * * * www-data curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/daily
```

It sweeps expired rate-limit buckets, reconciles `Batch.seatsTaken`, and prunes the
audit table. Pruning is a whitelist of sign-in and upload-signature counters kept
for 90 days (`AUDIT_NOISE_ACTIONS` in `src/server/dal/audit.ts`); payments,
invoices, receipts, certificates, user and settings changes are never touched,
because the accountant's retention floor for those is years, not weeks.

### Data retention

`POST /api/cron/retention` — the same secret, on its own weekly line, because it is
the one job in this file that deletes personal data:

```bash
# 04:00 Asia/Kathmandu, Mondays — /etc/cron.d/darbar-janitor
0 4 * * 1 www-data curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/retention
```

The windows are configured in **Settings → Retention** (`SiteSetting` key
`retention`, `src/server/dal/retention.ts`) and not hard-coded: leads **24 months**,
contact messages **12 months** by default, floor 1 month, ceiling 360. Saving them
requires a fresh 2FA code — they are listed in `SETTINGS_SENSITIVE_FIELDS` — because
lengthening a window is a privacy decision, not a text edit.

| Subject | What expires | What the job does |
|---------|--------------|-------------------|
| `Lead` | One window (24 months by default) after the last time anyone touched it (`updatedAt`) | Blanks `fullName`, `phone`, `phoneNormalized`, `email`, `message`, `ipHash` and stamps `deletedAt`; the notes on the activity trail are blanked too. `status`, `courseTitle` and `createdAt` survive, so the funnel and the monthly-enquiry chart still add up. |
| `ContactMessage` | One window (12 months by default) after it arrived (`createdAt`) | Deleted. There is no `deletedAt` on this table, and an anonymised row left in the queue would light the unread badge forever. |

Three things are deliberately out of reach:

- **Leads that became students** (`Lead.studentId` is set) are skipped. That row is
  the provenance of an enrollment, and the student's own data is handled by the
  explicit export/erase controls on their profile, not by a calendar.
- **Everything financial** — invoices, payments, receipts — is untouched, per the
  accountant's floor above.
- **One giant transaction.** The sweep is capped at `RETENTION_ROWS_PER_RUN` (1 000)
  rows per table per run and answers `{ remaining: true }` when there is more, so a
  first run against a years-old database chews through it over several weeks instead
  of deleting everything past the window in a single statement.

The job reports **counts only** (`leadsAnonymised`, `leadNotesCleared`,
`messagesDeleted`, `remaining`) — to the response and to the `AuditLog` entry. No
name, phone, email or message body ever enters the sweep's return value, so there is
nothing to leak in the log or in the operator's terminal.

Anonymisation is recoverable in the sense that the row survives; it is not recoverable
in the sense that the details are gone. `deletedAt` was already on the schema, and
`leadScopeWhere()` — the one predicate every lead query shares — now requires
`deletedAt: null`, so a purged lead disappears from the lists, the detail page, the
CSV export and the dashboard counts without a single query being edited by hand.

### Student data requests

Two buttons at the bottom of **Students → a student → Data requests**, for the two
letters a student can write to the institute. Both are `SUPER_ADMIN`-only
(`student.export`, `student.erase`), both ask for the authenticator code at the
moment of the click, and both write an audit entry.

**Export** (`src/server/dal/student-privacy.ts` → `collectStudentData`) answers
"what do you hold about me" with one JSON file, `darbar-student-DT-STU-YYYY-NNNNN.json`:
the account, every profile field, the enquiry that became the registration and the
notes on it, the classes, the invoices with their installments and receipts, the
certificates, the portfolio projects, the assignment links, the uploads, the sign-in
sessions (IP and user agent) and the audit rows naming this student.

- It is a Server Action with the file coming back in the response, **not a download
  URL**. A URL would have to carry the live 2FA code in its query string, and query
  strings end up in browser history and in the server's access log.
- Each collection is capped at `EXPORT_ROWS_PER_COLLECTION` (500) rows, and the file
  says which collections were cut in `truncated` rather than going quiet.
- Staff identities are stripped (`createdById`, `receivedById`, `voidedById`,
  `reviewedById`, `decidedById`, `uploadedById`, `assignedToId`, `actorId`, and the
  audit entry's actor). A hand-over of one person's file is not a hand-over of the
  whole office's; who clicked which button is on the admin audit screen under
  `audit.view`.
- The audit entry carries row counts, never a name from the file.

**Erase** (`eraseStudentIdentity`) replaces the identity and keeps the row, because
`Invoice.studentId` is `onDelete: Restrict` — the ledger must not lose the account a
receipt was written against:

| Rewritten | Left alone |
|-----------|------------|
| `User.name` → "Erased student", `email` → `erased-<id>@erased.invalid`, `image`, `isActive` false, `lastLoginAt` null | Invoices, installments, payments/receipts — the accountant's floor, and the only reason this is a rewrite and not a delete |
| `StudentProfile`: phone, date of birth, address, city, country, headline, bio, skills, interests, the three links, photo, `portfolioSlug` + `portfolioPublic` false, `rejectionReason` | Enrollments and certificates — a seat history and an issued award outlive the name printed on them; revoking a certificate is its own audited action |
| Portfolio projects → unpublished, title "Removed project", text and links blanked | `StudentProfile.studentCode` — the reference the money and the class lists were written against, and it identifies nobody once this row is a shell |
| Assignment submission links → `https://erased.invalid/`, review notes blanked | The converted `Lead` — a separate record with its own retention window, and the admission's provenance |
| Sessions deleted, two-factor secret deleted, credential hash nulled — the account cannot sign in again | `AuditLog` rows — the institute's record of its own staff, kept for years |

The photo is removed last and outside the transaction (`removeErasedPhoto`): a
storage timeout must not report a failed erasure after the identity is already gone,
and an `EXTERNAL` placeholder that this institute does not host is unlinked, not
deleted. There are no guardian fields in this schema — `docs/03` planned a `Guardian`
table and it was never built — so the profile is the whole student record.

**Monitoring**
- Uptime check on `/api/health` and the home page (e.g. UptimeRobot / Better Stack) with email/SMS alert.
- Error tracking (Sentry or equivalent), PII scrubbing on — see the next section.

### Error monitoring

The site has its own implementation rather than a vendor SDK: one JSON `POST` to an
HTTPS collector, which Sentry, GlitchTip, a self-hosted receiver or a log-shipper
webhook all accept. Nothing is sent until an operator configures it.

| Variable | Effect |
|----------|--------|
| `ERROR_REPORT_ENDPOINT` | Server collector. Unset ⇒ the reporter is disabled and every call is a no-op. |
| `NEXT_PUBLIC_ERROR_REPORT_ENDPOINT` | Browser collector. Set it to `/api/error-report` to turn the client half on — the same origin, so `connect-src 'self'` still covers it. Unset ⇒ no `error`/`unhandledrejection` listener is installed at all. |

Coverage (task 9): `onRequestError` in `src/instrumentation.ts` reports everything
Next does not catch — a Server Component render, a route handler, a server action,
the proxy; `src/instrumentation-client.ts` reports browser crashes, which never
reach the server by any other route; `fail()` in `src/server/actions/fees.ts` and
the catch in `POST /api/cron/[job]` report the two failures that have no visitor to
fail in front of — a broken payment, which answers the clerk with one generic
string, and a janitor that silently stopped running.

**The scrubbing is ours, not the vendor's** (`src/lib/error-report.ts`). A report
here is built from an exception whose message a form may have written, so the same
payload can carry an email address, a phone number, an invoice note and a six-digit
2FA code — `requireStepUp` reads the code out of the same object everything else is
read from. A vendor's own scrubbing is a black box that cannot be audited from this
repository, so the strings are cleaned before any transport exists: credential-shaped
keys (`*code`, `*otp`, `*password`, `*secret`, `*token`, `*cookie`, `*authorization`,
`*session`, `*api*key`), `Bearer …` values, email addresses and phone-shaped digit
runs are replaced; the query string is dropped; message/stack/label are capped. Bias
is stated in the code: over-redaction is acceptable, a leaked phone number is not.

`POST /api/error-report` is the ingest for the browser half and is modelled on
`/api/csp-report`: unauthenticated, 204 to everything including abuse, declared
`content-length` checked before the per-address limit is spent, and the body
re-scrubbed server-side because client-supplied fields are attacker-controlled text.
Both halves are budgeted (100 reports/10 min server, 20/10 min per browser tab,
120/hour per address on the ingest) so a dependency that is down cannot become a
flood. Tests: `tests/error-report.test.ts` (scrubber, transport, ingest route, and
the wiring read from source) and `tests/monitoring-services.test.ts` (what the two
server entry points actually put on the wire).

- Weekly look at: failed emails, spam rate, slow queries, disk usage.
- Google Search Console: submit the new sitemap, watch coverage/404s for 2 weeks after launch.

**Operations runbook (one page, keep in `docs/`)**: how to deploy, roll back, restore a backup, rotate secrets, add/remove staff, and who to call.

---

## 6. Go-live checklist

**Content**
- [ ] Real values in Site settings: name, phone, WhatsApp, email, address, hours, socials, map.
- [ ] Stats are real or removed (no "10+ years" placeholders).
- [ ] Team members with real photos and names — or section hidden.
- [ ] At least some real testimonials **with consent**, or the section is hidden.
- [ ] Events are real and future-dated; sample events deleted/archived.
- [ ] Blog: placeholder posts replaced or kept as drafts.
- [ ] FAQ policy answers (refunds, batch changes, certificates) confirmed by management.
- [ ] Gallery shows real institute photos (consent).
- [ ] All courses have a cover image, SEO title (≤ 60) and description (≤ 160).

**Technical**
- [ ] `NEXT_PUBLIC_SITE_URL` is the real domain; canonical URLs, OG images and sitemap use it.
- [ ] All old public URLs return 200 (compare against the old sitemap).
- [ ] `/techdarbar`, `/student/*` and `/verify/*` are `noindex`; no private URL is in the sitemap.
- [ ] Forms tested on production: inquiry + contact → lead/message + staff email + auto-reply.
- [ ] Turnstile keys are production keys; rate limit works.
- [ ] Email domain: SPF, DKIM, DMARC configured so notifications don't land in spam.
- [ ] Backups running, **restore tested**, monitoring alerts tested.
- [ ] All default/seed passwords changed; seed admin password rotated.
- [ ] Lighthouse (mobile) ≥ baseline on home, courses, course detail.
- [ ] 404 and 500 pages styled; error tracking receiving test event.
- [ ] Privacy notice and consent text published and linked.

**People**
- [ ] Staff accounts created with correct roles; each person has logged in once.
- [ ] 60–90 minute training done (leads workflow, editing a course, publishing a post, uploading media).
- [ ] One-page admin guide delivered.
- [ ] Rollback plan agreed (redeploy previous tag; DB restore steps).

**After launch (first 2 weeks)**
- [ ] Daily check of lead flow and error logs.
- [ ] Search Console: no spike in 404s or "Excluded" pages.
- [ ] Collect staff feedback; list the top 5 annoyances for a fast "polish" release.
