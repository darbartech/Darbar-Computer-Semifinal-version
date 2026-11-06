# 01 — Security Hardening (S1–S13)

Order matters: S1 → S2 → S8 first (they make every other limit meaningful).

---

## S1 — Stop trusting `CF-Connecting-IP` blindly
**File:** `src/server/services/rate-limit.ts`

Problem: the header is read first, even when the site is not behind Cloudflare, so any client can rotate it.

```ts
// .env: TRUSTED_PROXY=cloudflare | hops   (default "hops")
//       TRUSTED_PROXY_HOPS=1
function clientIpFromHeaders(h: Headers): string | null {
  const mode = process.env.TRUSTED_PROXY ?? "hops";

  if (mode === "cloudflare") {
    // Only valid if the origin firewall accepts traffic from Cloudflare IP ranges only.
    return h.get("cf-connecting-ip")?.trim() || null;
  }

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((x) => x.trim()).filter(Boolean);
    const index = hops.length - trustedProxyHops();
    if (index >= 0) return hops[index];
  }
  return h.get("x-real-ip")?.trim() || null; // set by your own proxy, never by clients
}
```
Also: in Caddy use `header_up -CF-Connecting-IP` (strip it) when not behind Cloudflare, and `header_up X-Forwarded-For {remote_host}` so the last hop is always yours.
Add the two env vars to `lib/env.ts` validation (warn if production and `TRUSTED_PROXY` unset).

**Test:** unit test `clientIpFromHeaders` with spoofed `cf-connecting-ip` in "hops" mode → must be ignored.

---

## S2 — Lock down the exposed Better Auth HTTP API
**File:** `src/app/api/auth/[...all]/route.ts`

Problem: `/api/auth/sign-in/email` bypasses your server-action limiter, role check and audit.

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

const handler = toNextJsHandler(auth.handler);

// Allow-list. Everything else is a 404. Add paths only when a UI needs them.
const ALLOWED = new Set<string>([
  "/get-session",
  "/sign-out",
  "/verify-email",          // S3 (GET link from email)
  "/two-factor/verify-totp" // S6, only if you call it from the browser; prefer server actions
]);

function guard(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "");
  return ALLOWED.has(path) ? null : new NextResponse(null, { status: 404 });
}

export const GET = (req: Request) => guard(req) ?? handler.GET(req);
export const POST = (req: Request) => guard(req) ?? handler.POST(req);
```
All sign-in/sign-up/reset flows then run **only** through your server actions, which already call `auth.api.*` directly with your own limiter.

Optional defence in depth in `server/auth.ts`:
```ts
rateLimit: { enabled: true, storage: "database", window: 60, max: 10 }, // needs Better Auth RateLimit table (run `npx @better-auth/cli generate`)
advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
```

---

## S3 — Email verification + bot protection on student sign-up
**Files:** `server/auth.ts`, `server/dal/students.ts`, `server/actions/student-auth.ts`, `lib/validators/student.ts`, `components/forms/StudentRegisterForm.tsx`, `server/student-session.ts`

1. **Auth config** (staff unaffected, because `requireEmailVerification` stays false):
```ts
emailVerification: {
  sendOnSignUp: false,           // we trigger it ourselves
  expiresIn: 60 * 60,            // 1 hour
  sendVerificationEmail: async ({ user, url }) => {
    await sendEmail({ to: user.email, subject: "Verify your email — DarbarTech",
      html: `<p>Hello ${escapeHtml(user.name)},</p><p><a href="${url}">Confirm your email</a> (valid 1 hour).</p>`,
      text: `Confirm your email: ${url}` });
  },
},
```
2. `createStudentAccount`: set `emailVerified: false`.
3. After creating the account in `registerStudent`, call `auth.api.sendVerificationEmail({ body: { email, callbackURL: "/student?verified=1" } })`.
4. **Gate in `requireStudent()`**: if `!session.user.emailVerified` → `redirect("/student/verify-email")` (page with "Resend email" button, limited to 3/hour).
5. **Turnstile + honeypot**: add `turnstileToken` and `website` (honeypot) to `studentRegisterSchema`; in `registerStudent` do *validate → honeypot → rate-limit → Turnstile* (same order as `submitInquiry`). Render `<TurnstileWidget />` in the form (the component already exists).
6. Staff-created students (doc 04) are the only ones allowed `emailVerified: true` at creation, because staff verified identity in person.

---

## S4 — Forgot / reset password (students and staff)
**New files:** `server/actions/password-reset.ts`, pages `/student/forgot-password`, `/student/reset-password`, `/techdarbar/forgot-password`, `/techdarbar/reset-password`.

Auth config:
```ts
emailAndPassword: {
  // ...existing
  sendResetPassword: async ({ user, url }) => { await sendEmail({ /* link valid 30 min */ }); },
  resetPasswordTokenExpiresIn: 60 * 30,
  revokeSessionsOnPasswordReset: true,
},
```
Server action (never reveal whether the email exists):
```ts
export async function requestPasswordResetAction(input: unknown) {
  const { email, turnstileToken } = resetRequestSchema.parse(input);
  const ip = await getClientIpHash();
  if (!(await allow(`pwreset:ip:${ip}`, { max: 5, windowMinutes: 60 }))) return GENERIC_OK;
  if (!(await allow(`pwreset:email:${hashIp(email)}`, { max: 3, windowMinutes: 60 }))) return GENERIC_OK;
  if (!(await verifyTurnstile(turnstileToken)).success) return { ok: false, error: VERIFICATION_FAILED };
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/student/reset-password" } }).catch(() => {});
  return GENERIC_OK; // "If that email exists, we sent a link."
}
```
`resetPasswordAction({ token, newPassword })` → `auth.api.resetPassword`, then audit `auth.password.reset`. For staff pages use the staff password policy (min 10) and add the new routes to the `proxy.ts` matcher exemption (like the login page) so they are reachable without a session.
Add the "Forgot password?" link to both login forms.

---

## S5 — Fix lock-out DoS and audit failures
**Files:** `server/services/rate-limit.ts`, `server/actions/auth.ts`, `student-auth.ts`

Count only **failed** attempts, and key the per-account counter by *account + IP*:
```ts
export async function isBlocked(key: string, max: number, windowMinutes: number) { /* count only */ }
export async function recordHit(key: string) { /* insert */ }

// sign-in
const accIp = `signin:acc-ip:${hashIp(email)}:${ipHash}`;   // 5 / 15 min  -> stops guessing from one IP
const accAny = `signin:acc:${hashIp(email)}`;               // 30 / 60 min -> alarm, not a lock
if (await isBlocked(accIp, 5, 15) || await isBlocked(`signin:ip:${ipHash}`, 20, 15)) return GENERIC;
...
catch/invalid credentials: await recordHit(accIp); await recordHit(`signin:ip:${ipHash}`); await recordHit(accAny);
audit({ actor: {id:"system", email:"-"}, action: "auth.signin.failed", entity: "User", meta: { ipHash } })
```
When `accAny` exceeds its threshold, email the account owner ("Several failed sign-in attempts") and the SUPER_ADMIN. An attacker on another IP can no longer lock the real admin out.
Do not store the typed email for unknown accounts (it may be a password pasted into the wrong field).

---

## S6 — Two-factor authentication for ADMIN/SUPER_ADMIN
1. Add Better Auth `twoFactor` plugin; run `npx @better-auth/cli generate` and copy the schema it prints (adds `User.twoFactorEnabled` and a `TwoFactor` model with secret + backup codes) into `schema.prisma`, then migrate.
2. `signInWithPassword`: `signInEmail` returns `{ twoFactorRedirect: true }` for 2FA users. Return `{ ok: false, needs2fa: true }` and show a 6-digit input; second action `verifyTotpAction({ code })` → `auth.api.verifyTOTP`, then continue with the existing role/audit code.
3. **Enforce** in `techdarbar/(protected)/layout.tsx`:
```ts
if ((user.role === "SUPER_ADMIN" || user.role === "ADMIN") && !user.twoFactorEnabled)
  redirect("/techdarbar/account/security?setup=required");
```
4. Page `/techdarbar/account/security`: QR enrol, show 10 backup codes once, "Disable" needs password.
5. Recovery: SUPER_ADMIN can reset another user's 2FA (audit entry); keep the CLI script `scripts/reset-2fa.ts` for the last SUPER_ADMIN.

---

## S7 — Make public certificate verification non-enumerable
**Files:** `server/dal/certificates/certificates.dal.ts` (`getPublicCertificateByQuery`), `server/certificates/issuance.ts`, `app/verify/page.tsx`

1. **QR/token links stay as they are** (24 random bytes — unguessable).
2. **Manual search** (number or student ID) must require a second factor: *certificate number AND recipient full name* (case-insensitive exact). Return the same "not found" message for any mismatch.
3. **Add a random suffix** to *new* numbers so they are not walkable: `DT-CERT-2026-00017-K7Q2` (4 chars from `ABCDEFGHJKMNPQRSTVWXYZ23456789`). Old numbers keep working.
4. Remove `recipientIdNumber` search from the public query (student IDs are sequential too).
5. Mask the display name for text lookups ("Ram S****a") but show it in full when arriving by QR token.
6. Add Turnstile + `allow("verify:"+ip, {max: 20, windowMinutes: 60})`.

---

## S8 — Atomic rate limiter
**Schema (doc 03, set A):** `RateLimitBucket { key, windowStart, count }` with `@@id([key, windowStart])`.
```ts
export async function allow(key: string, { max, windowMinutes }: RateLimitOptions) {
  const ms = windowMinutes * 60_000;
  const windowStart = new Date(Math.floor(Date.now() / ms) * ms);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key","windowStart","count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key","windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  return rows[0].count <= max;
}
```
Cleanup in the nightly cron (doc 07): `DELETE FROM "RateLimitBucket" WHERE "windowStart" < now() - interval '2 days'`. Remove the per-call `deleteMany`. Drop `RateLimitHit` after migrating callers.

---

## S9 — Order of checks in public forms
In `public-forms.ts`: **validate → honeypot → rate limit → Turnstile → insert**; pass `remoteip` (raw IP, in memory only) to `verifyTurnstile`.

## S10 — Enforce the CSP
1. Keep report-only for 7 days; read `[csp]` log lines; fix legitimate violations (Cloudinary, Turnstile, fonts).
2. Switch header to `Content-Security-Policy`. Use nonces for inline JSON-LD scripts (`serializeJsonLd`) or hash them.
3. Add `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
Also confirm: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera only if QR scanner needs it on `/verify`).

## S11 — Passwords
Student min 10 chars, reject top-10k common passwords (`zxcvbn` score ≥ 3 on the client for the meter; on the server only length + common-list check). Never log passwords. Staff: min 12 once 2FA is live.

## S12 — Public verify cache
Validate the query format with a regex **before** calling the `cached()` function; do not cache "not found" results; wrap the number+name lookup in an uncached function.

## S13 — Privacy and retention
1. `Lead.deletedAt` (soft delete) + nightly purge of leads older than 24 months with status LOST/SPAM (doc 03). Keep `hardDeleteLeads` but SUPER_ADMIN only with a typed confirmation.
2. Student "Download my data" (JSON of profile, enrollments, submissions) and "Request account deletion" (creates a task for staff; certificates are kept but unlinked — already `SetNull`).
3. Publish a privacy policy page covering what is collected (inquiries, student DOB/address/phone), why, retention, and contact. Check the wording against Nepal's Individual Privacy Act, 2075.
4. Never log phone numbers/emails (current code already avoids this — keep it in code review).

---

## Verification checklist (security)

- [ ] `curl -X POST https://site/api/auth/sign-in/email …` returns 404.
- [ ] Spoofed `CF-Connecting-IP` does not change the rate-limit bucket.
- [ ] 6 wrong passwords from IP A do not block the real user on IP B.
- [ ] New student cannot open the portal before verifying email.
- [ ] Password reset reply is identical for existing/non-existing emails (and similar timing).
- [ ] ADMIN without 2FA is redirected to the setup page.
- [ ] `/verify` rejects number-only searches.
- [ ] CSP enforced with zero new violations in staging.
