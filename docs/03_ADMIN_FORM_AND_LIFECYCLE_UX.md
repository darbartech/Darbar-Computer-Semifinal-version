# Admin Form & Certificate Lifecycle UX

This is the largest document because it's the largest gap: the backend supports a full certificate lifecycle (draft → preview → issue → revoke → reissue) and a full catalog system (courses, modules, signatories), but the frontend only exposes "create" and "list." Sections are ordered by leverage, not by file location.

---

## 1. Certificate list page (`/admin/certificates`) — fix search & pagination

**Current:** `apiClient.listCertificates({ limit: 50, status })`; no `q` param; no offset control; `stats` object is derived client-side from the currently-fetched page only (**bug-adjacent**: with a status filter of `""` and >50 total certificates, the "Total" stat card shows `pagination.total` correctly, but "Issued/Draft/Revoked" counts are computed by filtering the *fetched 50 rows*, not the true total — so those three numbers can be silently wrong once there are more than 50 certificates. This should be called out alongside MED-4 in the bug report as the same root cause.)

**Fix:**
- Add a debounced search box (300ms) bound to a new `q` query param. Search matches `recipient_name`, `certificate_number`, and `student_id`, case-insensitive, `ILIKE %q%` server-side (Supabase) / substring match (in-memory fallback).
- Replace the client-side `stats` derivation with the dedicated dashboard summary endpoint from `02_DASHBOARD_REDESIGN.md` §3.1 (or a lighter per-status `count()` call) so the numbers are always accurate regardless of pagination.
- Add Prev/Next controls (or numbered pages) using `pagination.total` / `pagination.limit` / `pagination.offset`, all of which the API already returns and the frontend already discards.
- Make each row clickable (not just the Download/Verify buttons) → navigates to the new certificate detail page (§2).

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Search recipient, cert #, student ID...   [Status ▾] │
├─────────────────────────────────────────────────────────┤
│  ... table (unchanged visual style) ...                  │
├─────────────────────────────────────────────────────────┤
│  Showing 1–50 of 214        [‹ Prev]  [Next ›]           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. NEW: Certificate detail page (`/admin/certificates/[id]`)

This is the single highest-value missing screen — it's the hub that makes revoke/reissue/audit-trail all reachable, and the backend endpoint (`GET /api/admin/certificates/[id]`) already returns everything it needs in one call.

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ← Back to Certificates              [Download PDF] [⋮ Actions]│
│                                                                  │
│ DT-CERT-2026-00042                              [ISSUED]       │
│ Mohan Shahi — Professional Web Development Bootcamp             │
├─────────────────────────────┬───────────────────────────────────┤
│ Details                     │ Audit Trail                       │
│ Student ID   DT-STU-2026-.. │ ● CREATED    Sep 12, 09:14  admin  │
│ Duration     3 Months       │ ● ISSUED     Sep 12, 09:20  admin  │
│ Grade        A              │ ● DOWNLOADED Sep 12, 09:21  admin  │
│ Issue Date   Sep 12, 2026   │ ● VERIFIED   Sep 14, 18:02  public │
│ Signatory    Rajesh Darbar  │ ● VERIFIED   Sep 15, 08:47  public │
│ 2nd Signatory Nirmala S.    │                                    │
│ Modules (4)                 │                                    │
│  1. HTML & CSS Foundations  │                                    │
│  2. JavaScript Essentials   │                                    │
│  3. React Fundamentals      │                                    │
│  4. Deployment & DevOps     │                                    │
│ Verification link  [copy] [open]                                 │
└─────────────────────────────┴───────────────────────────────────┘
```

### "⋮ Actions" menu (permission-gated per `AdminUser.permissions`)
- **Revoke** (`permissions.revoke`) — only shown for `ISSUED`/`REISSUED`. Opens a confirmation dialog requiring a non-empty reason (matches `certificateRevokeSchema` — min 1 char, max 500). On confirm, calls `apiClient.revokeCertificate(id, reason)`, then refreshes the page state to show the `REVOKED` badge + reason in the Details column.
- **Reissue** (`permissions.issue`) — only shown for `ISSUED`/`REISSUED`. Opens the existing Create Certificate form logic, but pre-filled from the current certificate's snapshot (the backend already assembles this correctly via `historicInput` in `reissueCertificate` — the frontend just needs a way to invoke it). Include the `refreshCourseData` checkbox described below.
- **Download** — already works, just relocate the existing button here as the primary action for issued certificates (keep it in the list-row Quick Action too, per existing pattern).

### Revoke dialog
```
┌────────────────────────────────────────┐
│ Revoke DT-CERT-2026-00042?              │
│                                          │
│ This certificate will immediately stop  │
│ verifying as valid. This cannot be      │
│ undone directly — the recipient would   │
│ need a reissued certificate.            │
│                                          │
│ Reason (required, visible in audit log) │
│ [________________________________]      │
│                                          │
│           [Cancel]   [Revoke]           │
└────────────────────────────────────────┘
```
Keep the "Revoke" button visually distinct (`.btn-danger`, already defined in `globals.css`) — this is the one destructive, publicly-visible action in the whole app and should never look like a routine button.

### Reissue flow
Reissue is more involved than revoke because the backend supports an important nuance: `refreshCourseData`. Surface it explicitly rather than hiding it:

```
┌──────────────────────────────────────────────────────────┐
│ Reissue DT-CERT-2026-00042                                │
│                                                             │
│ Reason (required)                                          │
│ [________________________________]                         │
│                                                             │
│ ○ Keep the original program/module data as originally      │
│   issued (just fix what I change below)                    │
│ ○ Refresh program/module data from the current course       │
│   catalog (use this if the course content has changed       │
│   since this certificate was first issued)                  │
│                                                             │
│ [Continue → opens prefilled certificate form]              │
└──────────────────────────────────────────────────────────┘
```
This maps directly onto the existing `refreshCourseData` boolean in `reissueCertificate()` / `certificateReissueSchema` — the backend logic (including the "course no longer exists" / "course is inactive" guard rails already in `reissueCertificate`) is solid; it just needs a front door in under an hour of component work once the dialog shell exists.

---

## 3. Create Certificate form — fixes to the existing flow

In priority order (see `01_BUG_REPORT.md` for full reasoning on each):

1. **Delete the render-time `setModuleFitIssues` call** (MED-1). Zero behavior change today, removes a landmine.
2. **Confirm before course-select overwrites typed data** (MED-2). Minimum viable fix: `if (hasManualProgramInput && !window.confirm("Switching courses will replace the program details you've entered. Continue?")) return;` before the existing overwrite logic in `handleCourseSelect`.
3. **Autosave draft to `sessionStorage`** (MED-3), keyed by a fixed key (e.g. `dt_cert_draft`) since this is a single-instance create form (no need for multi-draft support yet). On mount, if a saved draft exists and the form is otherwise empty, show a small banner: *"Restore unsaved certificate for **{name}**? [Restore] [Discard]"*.
4. **Inline field-level errors, not just a top banner.** Currently all validation errors surface as a single bulleted list at the top of the form (`formErrors`). For a form this long, an admin has to scroll back up, read the list, then scroll back down to find each field. Minimum fix: keep the top banner (good for a full summary) but also add a red border + inline message under any field whose error is present in `formErrors`.
5. **Show module-fit issues (`moduleFitIssues`) as inline warnings under the modules list**, not only after clicking into the Preview stage. `collectModuleFitIssues` already runs client-side before preview generation — running it on every module edit (debounced) and showing "⚠ This subtitle may be truncated on the printed certificate" next to the specific module input gives much faster feedback than discovering it only after clicking "Generate Preview."

---

## 4. NEW: Course management (`/admin/courses`)

Backing endpoints already exist (`GET`/`POST /api/admin/courses`); this doc specs the missing UI and the missing endpoints it also needs (edit/deactivate — currently only create exists).

### List view
Table: Code, Title, Duration, Active modules count, Status (Active/Inactive), Certificates issued (links to the filtered certificate list), Actions (Edit, Deactivate/Reactivate).

### Create/Edit form
Mirrors the fields already established in `CourseRecord`/`courseCreateSchema`: code, title, certificate title override, duration, provider name, completion statement, and a module editor **identical in interaction pattern to the module editor already built in `certificates/new/page.tsx`** (add/remove/reorder, title + subtitle, same 45/80 char limits pulled from `DARBARTECH_CERTIFICATE_TEMPLATE_V2.moduleConstraints`) — this is a straight lift-and-reuse of an existing, working component; extract it into a shared `<ModuleEditor>` component used by both forms rather than duplicating the JSX.

**New backend needed:** `PATCH /api/admin/courses/[id]` (update fields, activate/deactivate, add/edit/remove modules) — `db.courses.update()` and course-module mutation already exist at the DB layer; only the route + a bit of module-diffing logic is new work. Gate on `manageTemplates`, matching the existing `POST` route.

### Why this matters beyond convenience
Per HIGH-3 in the bug report, this isn't just an efficiency nice-to-have — right now, changing the course catalog requires either editing `courseCatalogSeed.ts` and redeploying, or an authenticated `curl` command. Neither is a reasonable operating model for an organization actively running training programs.

---

## 5. NEW: Signatory management (`/admin/signatories`)

Smaller scope than courses — a signatory is just name + position + optional signature image + active flag.

### List view
Simple table: Name, Position, Status, Actions (Edit, Deactivate). Highlight if a signatory is currently referenced as the **default secondary signatory** (`DEFAULT_SECONDARY_SIGNATORY` in `certificateService.ts` — currently hardcoded to "Nirmala Shrestha" in source code, not configurable at all).

### Worth calling out explicitly
`DEFAULT_SECONDARY_SIGNATORY` being a source-code constant (rather than a `signatories` record with a `isDefaultSecondary` flag) means changing the org's Managing Director requires a code change + deploy, same class of problem as the course catalog. Once the signatory management UI exists, promote this to a real, editable "default secondary signatory" setting (a boolean flag on the signatory record, enforced unique via application logic) rather than a hardcoded constant. This is a small schema/service change (`SignatoryRecord.active` already exists as precedent for this kind of flag) but meaningfully closes the same operational gap course management closes.

**New backend needed:** `PATCH /api/admin/signatories/[id]`, same shape as the course PATCH above.

---

## 6. Accessibility & polish pass (applies across all forms)

Quick wins, not a redesign:
- The module reorder buttons (`↑`/`↓`) in `certificates/new/page.tsx` have `title` attributes but no `aria-label`, and are plain `✕`/`↑`/`↓` glyphs with no `sr-only` text — a screen reader announces "button" with no description. Add `aria-label="Move module up"` etc.
- Required fields are marked with a trailing `*` in the label text only (no `aria-required`/`required` mismatch — actually check: `recipient.name` input has no `required` attribute at all despite being marked `*` and validated in `validateForm()`; only `issueDate` has `required`). Add the native `required` attribute consistently so browser-level validation and screen readers agree with the visual `*`.
- Status badges (`badge-issued`, etc.) convey state by color; confirm (via `certificateStatus.ts`) that they also carry distinguishable text (they do — `formatStatus`) — good, just noting this should stay true as new statuses/badges are added.
