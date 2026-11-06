# 08 — UX / UI Improvements

Apply alongside each phase. Components already available: shadcn-style `ui/*`, `useToast`, `react-hook-form + zod`.

---

## 1. Student journey (highest impact)
**Today:** register → toast "Your student account is ready" → portal where everything is locked until approval.

**Target journey**
1. Register (Turnstile, password strength meter, show/hide password, clear privacy consent).
2. **Check your email** screen (doc 01 S3) with *Resend email* (cooldown 60 s) and *Change email*.
3. After verification: **"Your registration is under review"** page — status stepper `Registered ✔ → Email verified ✔ → Admin approval ⏳ → Choose a course`, expected time ("usually within 1 working day"), office phone/WhatsApp, what to bring for admission.
4. Approved: email/SMS + portal banner "Choose your course" → enrollment request with batch preference.
5. Enrollment decision message: approved (batch, start date, room/time, fee due) / waitlisted (position) / declined (reason + contact).

Copy (ready to paste; adapt tone):
- After register: *"Account created. Please confirm your email — we sent a link to {email}."*
- Pending: *"Thanks, {name}. Our team is reviewing your registration. You will get an email as soon as it is approved."*
- Rejected: *"We could not approve your registration. Reason: {reason}. Please call {phone} or visit the office."*
- Login error (generic): *"Email or password is incorrect."* (keep; add *Forgot password?* link beside the field).
- Rate limited: *"Too many attempts. Please wait a few minutes and try again."* (today it shows the same generic credential error, which confuses real users — show this message **after** the 5th failure from the same IP, since it reveals nothing about the account.)

## 2. Role-based admin home
| Role | Landing | Widgets |
|---|---|---|
| RECEPTION | Today | new inquiries, walk-in "Quick add lead", today's classes, record payment shortcut |
| COUNSELOR | My leads | follow-ups due, unassigned queue, demo classes this week |
| ACCOUNTANT | Dues | overdue by aging, today's collection, day-book |
| INSTRUCTOR | My batches | today's classes + *Take attendance*, submissions to review, upcoming exams |
| ADMIN/SUPER_ADMIN | Overview | KPIs from doc 07 §3 + alerts (pending approvals, low attendance, failed notifications) |
Implementation: single `/techdarbar` page choosing a server component by role; sidebar items filtered with `can()`; group the sidebar (*Admissions · Academics · Finance · Website · Settings*) because it is already long.

## 3. Tables & forms
- **Saved filters** (URL params already drive lists — add "Save view" per user in localStorage first, DB later).
- **Bulk actions** with a sticky action bar and confirmation count ("Archive 12 leads?"); destructive actions need typed confirmation.
- **Export** button on every list (permission-gated).
- **Inline status change** with optimistic update + undo toast (5 s).
- **Duplicate warning** chips (lead/student) with "view existing".
- Unsaved-changes guard on long forms (`CourseForm`, `SettingsPanel`, `BlogFormClient`).
- Autosave drafts for blog/course long text (localStorage + "Restore draft").
- Empty states with one clear primary action ("No batches yet — Create batch").
- Skeletons (`ui/skeleton`) for every list; `loading.tsx` per route group.

## 4. Mobile
- Admin: bottom-sheet filters, card layout for tables < 640 px, 44 px touch targets, sticky primary action, attendance screen designed first for phones.
- Student portal: bottom tab bar (Home · Classes · Assignments · Fees · Profile).
- Public: sticky "Call / WhatsApp / Inquire" bar on course pages; inquiry form needs only name + phone first (course, batch, message optional) — fewer fields = more leads.

## 5. Accessibility (WCAG 2.2 AA)
- Server errors currently show only as toasts on login/register: also render inline `role="alert"` text and move focus to the first invalid field / error summary on submit.
- Toast region `aria-live="polite"`; do not auto-dismiss errors under 8 s.
- Visible focus rings on all interactive elements; check colour contrast of `text-neutral-500` on white and `bg-neutral-50` (needs ≥ 4.5:1 for body text).
- Labels linked with `htmlFor` (already done in forms) — keep for new forms; use `aria-describedby` for hints/errors.
- Dialogs/sheets: focus trap and return focus (Radix does this — don't replace with custom).
- Tables: `<th scope>`, captions for screen readers; status never by colour alone (icon + text).
- Run `axe` in Playwright on login, register, inquiry, verify, admin list pages (doc 09).
- QR scanner (`VerifyQrScanner`): provide manual entry fallback and clear camera-permission messaging.

## 6. Nepali language & Bikram Sambat
- **i18n**: introduce `next-intl` (or a light dictionary) with `en` and `ne`; start with student portal, inquiry form, verify page, fee/attendance SMS. Fonts: add a Devanagari-capable font (Noto Sans Devanagari) to the PDF generator **only if** Nepali text will appear on certificates/receipts (the embedded Montserrat/Cormorant fonts do not contain Devanagari glyphs).
- **BS dates**: add `src/lib/bs.ts` (library such as `nepali-date-converter` or a verified lookup table, since BS month lengths vary by year) with `toBS(date)` → `{y,m,d}` and formatting "२०८३ कार्तिक १९". Show BS next to AD on notices, batch start, fee due, and optionally on certificates (a setting `certificate.showBsDate`). Store dates as AD in DB always.
- Numbers/currency: format NPR with Indian-style grouping (`en-NP`: 1,25,000) — `Intl.NumberFormat("en-NP", {style:"currency",currency:"NPR"})`.
- Phone input: country code prefilled +977, accepts 98XXXXXXXX (doc 04 §4).

## 7. Public website conversion
- Course page: fee, duration, next batch date + seats left (from B1), instructor, schedule, syllabus accordion, "Book free demo" with date selector (creates lead with `DEMO_SCHEDULED` & `followUpAt`).
- Social proof: testimonials (consent flag exists), placement/alumni counts, Google rating — only with verifiable numbers (Settings already has "unverified" flag for stats; keep).
- Speed: confirm images use `next/image` with `sizes`, Hero (666 lines) lazy-loads heavy parts, Lighthouse mobile ≥ 90.
- SEO: `sitemap.ts` exists; add `Course` JSON-LD (already present) with `offers` and `hasCourseInstance` (batch dates); `hreflang` once `ne` pages exist.
- Track WhatsApp/call clicks as events (UTM on outbound `wa.me` text, or a tiny `/api/track` endpoint) and create `WHATSAPP` leads when the visitor submits.

## 8. Certificates & verification UX
- Verify page: clear states — *Valid · Revoked (reason category) · Superseded by reissue · Expired · Not found*, with plain-language explanation; print-friendly.
- Student portal: "Share certificate" (verify link, LinkedIn "Add to profile" link), "Download PDF".
- Admin: preview before issue (exists), bulk issue progress bar, "Reason" quick picks for revoke.

## 9. Design-system hygiene
- Tokens for status colours (success/warn/danger/info) in `globals.css`; reuse `StatusBadges.tsx` for all new statuses (enrollment, invoice, attendance, exam).
- One `DataTable` wrapper (sort, filter, pagination, empty/loading) instead of per-feature tables.
- One `ConfirmDialog` component (title, consequence text, optional typed confirmation).
- One `Money` and one `DateText` component (NPR + Asia/Kathmandu + optional BS).
- Document components in a `/techdarbar/_design` page (dev only) or Storybook.

## 10. UX acceptance checklist
- [ ] A new student always knows the next step and its status without contacting staff.
- [ ] Receptionist admits a walk-in in < 2 minutes on a laptop; instructor takes attendance of 25 students in < 30 s on a phone.
- [ ] Every error message says what to do next.
- [ ] Keyboard-only run through login → admission → payment works.
- [ ] axe: zero critical/serious violations on key pages.
