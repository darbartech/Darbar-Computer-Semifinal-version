# Implementation Roadmap

Sequenced so that each phase is independently shippable and reduces risk before adding surface area. Effort sizes are rough (S = a few hours, M = 1–2 days, L = 3–5 days) assuming one engineer familiar with the codebase.

---

## Phase 0 — Stop the bleeding (data integrity & security)
*Ship this before anything else, even before the dashboard. None of it is user-visible in a positive way, but it closes the paths that can silently lose or duplicate real certificates.*

| Task | Ref | Size |
|---|---|---|
| Distinguish "not found" vs. "error" in single-row DB reads (`PGRST116` check) | `04` §2 | S |
| Scope the Supabase circuit breaker per-table with cooldown/half-open instead of global-permanent | `04` §1 | M |
| Make numbering fail closed (remove non-atomic fallback) | `04` §4 | S |
| Handle DB-commit failure after PDF render as a distinct, loud error path in `issueCertificate` | `04` §3 | S |
| Apply `validateRateLimit` centrally inside `withAdminAuth` | `04` §5 | S |
| Fix login lockout window extension bug | `04` §6 | S |
| Delete the render-time `setModuleFitIssues` call | `01` MED-1 | S (5 min) |
| Fix hardcoded `#c9a227` → `brand-gold` token in two spots | `01` LOW-1 | S (5 min) |

**Exit criteria:** A simulated Supabase outage (kill the connection mid-session) degrades one operation, recovers automatically within the cooldown window, and never silently produces a duplicate certificate number or a crashed issuance request.

---

## Phase 1 — Health visibility
*Small, but it's the dependency for admins ever trusting the system enough to use Phase 2/3 features confidently.*

| Task | Ref | Size |
|---|---|---|
| `GET /api/admin/health` endpoint exposing per-table circuit state | `04` §1 | S |
| Persistent degraded-mode banner in `AdminLayout` | `02` intro, `01` CRIT-1 | S |

---

## Phase 2 — Dashboard
| Task | Ref | Size |
|---|---|---|
| `GET /api/admin/dashboard/summary` (counts + trend %) | `02` §3.1 | S |
| `GET /api/admin/dashboard/issuance-trend` | `02` §3.2 | S |
| `GET /api/admin/dashboard/by-course` | `02` §3.3 | S |
| `GET /api/admin/dashboard/activity` | `02` §3.4 | M |
| "Attention needed" panel (stale drafts, zero-module courses) | `02` §3.5 | M |
| `/admin/page.tsx` becomes the real dashboard (remove redirect) | `02` §2 | M |

**Exit criteria:** Landing on `/admin` answers "is everything OK, what happened recently, what needs attention" without clicking into the certificate list.

---

## Phase 3 — Certificate lifecycle UI (revoke/reissue/detail)
*This is the single biggest product gap closed in one phase.*

| Task | Ref | Size |
|---|---|---|
| `/admin/certificates/[id]` detail page (details + audit trail, read-only) | `03` §2 | M |
| Revoke dialog + wiring to existing `apiClient.revokeCertificate` | `03` §2 | S |
| Reissue entry dialog (reason + refresh-course-data choice) → prefilled create form | `03` §2 | L |
| Make certificate list rows clickable to the detail page | `03` §1 | S |

**Exit criteria:** An admin can revoke a certificate and reissue a corrected one entirely from the UI, with the audit trail visible for both.

---

## Phase 4 — Catalog management UI
| Task | Ref | Size |
|---|---|---|
| Extract `<ModuleEditor>` from `certificates/new/page.tsx` into a shared component | `03` §4 | S |
| `PATCH /api/admin/courses/[id]` (update fields + modules, activate/deactivate) | `03` §4 | M |
| `/admin/courses` list + create/edit pages | `03` §4 | L |
| `PATCH /api/admin/signatories/[id]` | `03` §5 | S |
| `/admin/signatories` list + create/edit pages | `03` §5 | M |
| Promote `DEFAULT_SECONDARY_SIGNATORY` from a source constant to a flagged record | `03` §5 | M |

**Exit criteria:** Adding a new training program to the certificate system requires zero code changes or manual API calls.

---

## Phase 5 — Create-form UX polish & list improvements
*Deliberately last — these are real improvements but lower risk/impact than Phases 0–4, and some (module editor extraction) are naturally sequenced after Phase 4 touches the same component.*

| Task | Ref | Size |
|---|---|---|
| Confirm-before-overwrite on course select | `03` §3.2 | S |
| Draft autosave to `sessionStorage` + restore banner | `03` §3.3 | M |
| Inline field-level validation errors | `03` §3.4 | M |
| Live module-fit warnings per-field | `03` §3.5 | M |
| Certificate list search (`q` param) + real pagination controls | `03` §1 | M |
| Fix client-side stat miscount beyond first page (use dashboard summary endpoint instead) | `03` §1 | S |
| Accessibility pass (aria-labels, `required` attributes) | `03` §6 | S |

---

## Explicitly out of scope for this roadmap

- Multi-tenant / multi-organization support (this system is single-org by design — `ISSUER_NAME` is a constant, and that's fine for DarbarTech's current needs).
- Bulk/batch certificate issuance (CSV import → many certificates). Worth a future doc if/when a cohort-graduation workflow becomes common enough to justify it, but it's a materially different UX (review-before-bulk-issue, partial-failure handling) that shouldn't be bolted onto the single-certificate flow.
- Public-facing verification page redesign — out of scope for this audit, which focused on the admin surface; the public `/verify` pages weren't reviewed in depth here and deserve their own pass.
- Real admin account management UI (inviting new admins, roles) — depends on Phase-adjacent but separate work (moving off `DEFAULT_USERS`, per `04` §7) that should be scoped once there's a concrete need for a third admin.
