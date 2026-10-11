# Dashboard Redesign — `/admin` Home

## Current state

```tsx
// src/app/admin/page.tsx — the entire file
import { redirect } from "next/navigation";
export default function AdminRootPage() {
  redirect("/admin/certificates");
}
```

There is no dashboard. Landing in `/admin` takes you straight to a plain table. There's no way to answer, at a glance: *How many certificates did we issue this month? Is anything overdue for revocation review? Which course is most used? Did anyone verify a certificate today?*

This doc specs an actual home dashboard, reusing data that mostly already exists on the backend.

---

## 1. Design goals

1. **Answer "is everything OK?" in under 3 seconds.** Top-line stats + a status banner if the system is degraded (see `04_BACKEND_RELIABILITY_AND_SECURITY.md` §1 — the health banner belongs here first and in the persistent header).
2. **Get to the next action fast.** The two most common admin actions (issue a new certificate, find a specific certificate) should be reachable in one click from this page, not just from the nav bar.
3. **Don't invent data.** Every widget below is scoped to data the backend already computes or can compute with a trivial query — no new subsystems required for v1.

## 2. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header (existing AdminLayout — add health banner slot here)    │
├─────────────────────────────────────────────────────────────────┤
│  Welcome back, {username}          [+ New Certificate] [Search] │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│ Issued (30d)  │ Draft         │ Revoked        │ Verified (7d)   │
│   142   ▲12%  │   6           │   1            │   58            │
├───────────────┴───────────────┴────────────────┴─────────────────┤
│  Issuance trend (last 12 weeks)          │  By course (top 5)    │
│  [line/bar chart]                        │  [horizontal bars]    │
├───────────────────────────────────────────┴────────────────────┤
│  Recent activity (audit feed, last 15 events across all certs) │
│  ISSUED   Mohan Shahi — Web Dev Bootcamp        2m ago  by admin│
│  VERIFIED DT-CERT-2026-00041                    1h ago  public  │
│  REVOKED  DT-CERT-2026-00039 — "Recipient..."   3h ago  by staff│
├───────────────────────────────────────────────────────────────┤
│  Attention needed                                                │
│  • 6 draft certificates older than 7 days — clean up or issue   │
│  • Course "Advanced Excel" has 0 active modules — will fail     │
│    issuance if selected                                          │
└───────────────────────────────────────────────────────────────┘
```

## 3. Widget specs

### 3.1 Top-line stat cards
Reuse the exact card pattern already in `certificates/page.tsx` (`.card .card-body`, uppercase label + big number) — don't invent a new visual language, just relocate and extend it:

- **Issued (30d)** — count of `ISSUED`/`REISSUED` where `issued_at` in last 30 days. Show trend vs. previous 30 days (`▲12%` / `▼4%` / `—`).
- **Draft** — count of `DRAFT` status certificates. This is a "cleanup" signal, not a vanity metric — pair with the "Attention needed" panel below.
- **Revoked** — count of `REVOKED`, all-time or last 90d (pick one, label it explicitly either way).
- **Verified (7d)** — count of `VERIFIED` events in `certificate_events` in the last 7 days. This is the only metric that reflects *external* usage (public verification-page hits + manual lookups) rather than internal admin activity — it's the closest thing this system has to "is this certificate actually being checked by employers/institutions," which is the entire point of issuing verifiable certificates.

**Data contract — new endpoint:** `GET /api/admin/dashboard/summary`
```ts
type DashboardSummary = {
  issuedLast30d: number;
  issuedPrev30d: number;      // for trend arrow
  draftCount: number;
  revokedCount: number;
  verifiedLast7d: number;
  generatedAt: string;
};
```
Implementation note: `db.certificates.count({ status })` already exists; add a date-range variant (`count({ status, since })`) rather than pulling full lists into memory to count client-side.

### 3.2 Issuance trend chart
Simple weekly bar/line chart, last 12 weeks, count of certificates issued per week. This is the one part of the dashboard that benefits from a real chart component — everything else is served fine by numbers and lists. Keep it to a single series; resist the urge to overlay revoked/draft on the same chart in v1 (it gets noisy and doesn't answer a clear question).

**Data contract:** `GET /api/admin/dashboard/issuance-trend?weeks=12` → `{ weekStart: string; count: number }[]`.

### 3.3 By-course breakdown
Horizontal bar list, top 5 courses by certificates issued (all-time or last 90d — pick 90d, it's more actionable). This answers "which programs are actually being certified" and doubles as an early warning for HIGH-3 in the bug report: if an admin can see "Advanced Excel: 0 certificates ever," that's a signal the course needs attention (inactive? no modules configured? nobody knows it exists?) — which motivates and justifies building the course-management UI in `03_ADMIN_FORM_AND_LIFECYCLE_UX.md` §4.

**Data contract:** `GET /api/admin/dashboard/by-course?limit=5&days=90` → `{ courseId: string; courseTitle: string; count: number }[]`.

### 3.4 Recent activity feed
Last 15 `certificate_events` across *all* certificates (not per-certificate — that view already exists conceptually via MED-5's detail page audit trail), newest first, each row: event type badge, a one-line human description (recipient + program, or certificate number for verify/revoke events), relative timestamp, actor (or "public" for verify events with no `actor_id`). Clicking a row deep-links to that certificate's detail page (`/admin/certificates/[id]`, per MED-5).

**Data contract:** `GET /api/admin/dashboard/activity?limit=15` — a thin wrapper that queries `certificate_events` ordered by `created_at desc` across all certificates and joins just enough certificate fields (recipient name, program title, certificate number) to render the description without N+1 lookups on the frontend.

### 3.5 "Attention needed" panel
This is the highest-leverage widget on the page and the cheapest to build, because it's just naming problems the backend already silently tolerates:
- **Stale drafts** — `DRAFT` certificates older than N days (configurable, default 7). These represent either abandoned work or forgotten certificates that should have been issued. Link each to "Resume" (opens the create form pre-filled) or "Discard."
- **Courses with zero active modules** — any course where `courseModules.findByCourseId(id, true)` returns `[]`. Selecting such a course in the Create form currently produces a confusing "0/4 modules" state with no explanation of *why*; surfacing it proactively here is strictly better than letting an admin discover it mid-form.
- **(Once CRIT-1/CRIT-2 are fixed with a reconciliation job, per `04_BACKEND_RELIABILITY_AND_SECURITY.md`)** — orphaned PDFs / DB-desync warnings belong here too.

This panel should be empty most days — that's the point. An empty "Attention needed" section with a small "✓ Nothing needs attention" state is itself useful information (confirms the check ran).

## 4. What NOT to build in v1

- Don't build a generic drag-and-drop "widget dashboard" or per-admin customizable layout. This is an internal tool for a small admin team issuing certificates for training programs — a fixed, opinionated layout answering the 5 questions above is more useful than a configurable one nobody will configure.
- Don't chart revoked-certificate reasons or build a "revocation analytics" section yet — there's not enough volume for it to be meaningful, and it risks looking like the dashboard cares more about the exception path than the core workflow.
- Don't add real-time (websocket) updates. A dashboard that refetches on mount + has a manual refresh button is entirely sufficient for this usage pattern (a handful of staff checking in periodically), and avoids the complexity/cost of a live connection.

## 5. Implementation notes

- Reuse `.card`, `.card-body`, `.badge`, `.btn-*` classes already defined in `globals.css` — this dashboard should look like it was always part of the app, not a bolted-on redesign.
- All new `/api/admin/dashboard/*` endpoints go through `withAdminAuth` exactly like existing routes (no new permission needed — dashboard visibility should match "can log into the admin at all," i.e. no permission gate beyond authentication).
- Route: `src/app/admin/page.tsx` stops being a redirect and becomes the dashboard page itself. Keep `/admin/certificates` as the full list/manage view (nav link stays as-is).
