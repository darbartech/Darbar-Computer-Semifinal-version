# Backend Reliability & Security Improvements

Companion to `01_BUG_REPORT.md` — this doc gives concrete implementation direction for the 🔴/🟠 items, plus a few additional hardening recommendations that came up during the review but aren't outright bugs.

---

## 1. Database layer: replace the global circuit breaker with a scoped, recoverable one

**Target:** `src/lib/database/index.ts`

Current shape (simplified):
```ts
let SUPABASE_UNHEALTHY = false;
const usingSupabase = (op, err) => {
  if (!USE_SUPABASE) return false;
  if (SUPABASE_UNHEALTHY) return false;
  if (err) tripCircuit(op, err);   // sets SUPABASE_UNHEALTHY = true forever
  return true;
};
```

**Recommended shape:**
```ts
type CircuitState = { failedAt: number; failureCount: number };
const circuits = new Map<string, CircuitState>(); // keyed by table, not global
const COOLDOWN_MS = 30_000;
const TRIP_THRESHOLD = 3; // consecutive failures before opening

function isOpen(table: string): boolean {
  const c = circuits.get(table);
  if (!c) return false;
  if (c.failureCount < TRIP_THRESHOLD) return false;
  return Date.now() - c.failedAt < COOLDOWN_MS; // half-open after cooldown
}

function recordFailure(table: string) {
  const c = circuits.get(table) || { failedAt: 0, failureCount: 0 };
  circuits.set(table, { failedAt: Date.now(), failureCount: c.failureCount + 1 });
}

function recordSuccess(table: string) {
  circuits.delete(table); // reset on any success
}
```

Key differences from today:
- **Scoped by table** (`certificates`, `courses`, `signatories`, `numbering`), not one global flag — a courses-list hiccup shouldn't take certificate issuance down with it.
- **Self-healing.** After `COOLDOWN_MS`, the next call is allowed through again (half-open); success resets the failure count, continued failure re-opens it. No process restart required to recover.
- **Threshold, not first-failure.** One transient error shouldn't open the circuit — require a few in a row, since a single flaky request during a cold start is normal and shouldn't degrade the whole system.

Every `db.<table>.<op>` implementation should call `recordSuccess(table)` on the happy path and `recordFailure(table)` in the catch, replacing the current single `tripCircuit` call site.

## 2. Distinguish "not found" from "error" in every single-row read

**Target:** `certificates.findById`, `certificates.update`, `signatories.findById` in `database/index.ts`.

Current pattern conflates the two:
```ts
const { data, error } = await supabaseAdmin!.from("certificates").select("*").eq("id", id).single();
if (error) return null;   // could be "0 rows" OR "connection reset" OR "permission denied"
```

Supabase/PostgREST returns a specific error code (`PGRST116`) when `.single()`/`.update().select().single()` finds zero rows — that's the *only* case that should map to `null`. Everything else should be treated as a real failure:

```ts
if (error) {
  if (error.code === "PGRST116") return null; // genuinely not found
  throw error; // let the caller's try/catch + circuit breaker handle it
}
```

This single change fixes the root cause of **CRIT-2**: once `update()` throws instead of silently returning `null` on a real error, the existing `try { ... } catch (err) { usingSupabase(op, err) }` wrapper in each `db.*` method does the right thing (records the failure, falls back to in-memory *if the circuit allows it*, or surfaces the error) instead of masking a real outage as "the certificate doesn't exist."

## 3. Make `issueCertificate` explicit about the post-render, pre-commit failure window

**Target:** `src/lib/services/certificateService.ts`, `issueCertificate()`.

Once §2 above is in place, `db.certificates.update()` can throw instead of silently returning `null`. `issueCertificate` should catch that specific case and respond differently than a normal validation failure, because at that point in the function a side effect (PDF written to storage, certificate number consumed) has already happened and cannot be silently retried with the same inputs without producing a second orphaned PDF under a *new* number.

```ts
let targetCert: CertificateRecord | null;
try {
  targetCert = await db.certificates.update(draftId, { ...fields, status: "ISSUED" });
} catch (err) {
  // The PDF + storage key + certificate number already exist at this point.
  // Do NOT tell the caller to just retry — that mints a second number/PDF
  // for the same attempt. Log loudly and return a distinct error the UI
  // can render as "contact engineering," not "try again."
  console.error(`[issueCertificate] DB commit failed after PDF render for ${certificateNumber}`, err);
  return {
    success: false,
    errors: [
      `Certificate content was generated (number ${certificateNumber}) but could not be saved. ` +
      `Do not retry — contact an administrator to reconcile storage key ${pdfStorageKey}.`,
    ],
  };
}
if (!targetCert) { /* the create()-path equivalent, same treatment */ }
```

Longer term: add a small reconciliation job/admin action that lists storage keys under `storageService` with no matching `certificates.pdf_storage_key`, so this failure mode has a recovery path beyond "an engineer reads the log."

## 4. Numbering: fail closed, not open

**Target:** `src/lib/database/index.ts`, `numbering.nextNumber()`.

Replace the non-atomic `count()+1` fallback with a hard failure:
```ts
numbering: {
  nextNumber: async (prefix, year) => {
    if (usingSupabase("numbering")) {
      try {
        const { data, error } = await supabaseAdmin!.rpc("next_certificate_number", { p_prefix: prefix, p_year: year });
        if (error) throw error; // no non-atomic fallback — see rationale below
        recordSuccess("numbering");
        return data as number;
      } catch (err) {
        recordFailure("numbering", err);
        throw new Error("Certificate numbering is temporarily unavailable. Please try again shortly.");
      }
    }
    return inMemoryDb.numbering.nextNumber(prefix, year);
  },
},
```
Rationale: unlike general read availability, **uniqueness of the certificate number is a correctness property with legal/compliance weight** (it's the identifier a third party — employer, institution — types into the manual verification form). A short, visible "try again" failure is a far better outcome than a silent duplicate discovered months later during an audit.

## 5. Apply the existing rate limiter to admin routes, at the middleware level

**Target:** `src/lib/middleware/auth.ts`, `withAdminAuth()`.

Rather than adding a `validateRateLimit(...)` call to each of the ~10 admin route files individually (easy to forget on the next new route), enforce it once, centrally:

```ts
export const withAdminAuth = (handlerOrPermission, maybeHandler?) => {
  // ...existing setup...
  return async (req, ctx) => {
    // ...existing cookie/session parsing...
    const user = parseSessionToken(token);
    if (!user) { /* existing */ }

    const rl = validateRateLimit(`admin:${user.id}:${getClientIp(req)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    if (requiredPermission && !checkPermission(user, requiredPermission)) { /* existing */ }
    return handler(req, { ...ctx, user });
  };
};
```
Consider a tighter, separate limiter (e.g. `createRateLimiter(10, 60_000)`) specifically for routes requiring the `issue` or `revoke` permission, since those are the highest-consequence, lowest-frequency-in-legitimate-use actions — a legitimate admin issuing 10 certificates a minute is already an edge case; issuing 100 is almost certainly a bug or an incident.

## 6. Login lockout: don't extend the window on attempts made while already locked out

**Target:** `src/lib/services/authService.ts`, `authenticateAdmin()`.

```ts
export const authenticateAdmin = async (username, password) => {
  await initPasswords();
  if (isLockedOut(username)) return null;   // <-- check first, don't record another attempt

  const user = DEFAULT_USERS.find((u) => u.username === username);
  const hash = user ? PASSWORD_HASHES[user.username] : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    recordFailedAttempt(username);
    return null;
  }

  clearAttempts(username);
  return user;
};
```
Note: still call `bcrypt.compare` against the dummy hash even when locked out is *not* necessary for timing-safety in this branch (we return before it), but to preserve constant-time behavior between "locked out" and "not locked out" responses, keep a dummy `await bcrypt.compare(password, DUMMY_HASH)` call before the early return if timing side-channels between "this account is locked" and "this account doesn't exist" matter for the threat model. Given this is an internal 2-account admin system, this is a nice-to-have, not a blocker.

## 7. Additional hardening worth scheduling (not blocking, not in the original bug list)

- **Move admin accounts out of source-defined `DEFAULT_USERS` + env-var passwords and into the `admins` table** already scaffolded in `supabase/migrations/001_certificate_system_schema.sql` (per the `// NOTE:` comment already in `authService.ts` acknowledging this is a placeholder). Two hardcoded accounts (`admin`/`staff`) is fine for initial launch, but as soon as there's more than one real "staff" user, individual accounts are needed for the audit trail (`actor_id` in `certificate_events`) to mean anything — right now, every staff-role action is attributed to the same generic `user-admin` ID, which weakens exactly the auditability the rest of the system was clearly designed to provide.
- **`getClientIp()` trusts `x-forwarded-for` unconditionally.** Fine behind a trusted reverse proxy (Vercel, most managed platforms) that overwrites rather than appends this header, but worth a one-line comment in the code confirming that assumption is true for the actual deployment target — otherwise a client can spoof this header and reset their own rate-limit bucket by rotating a fake IP.
- **CORS/CSRF:** cookies are set with `sameSite: "strict"`, which is the strong, correct default for this kind of app (no legitimate cross-site navigation should ever need to carry the session cookie) — no change needed, just noting it was checked and is right.
