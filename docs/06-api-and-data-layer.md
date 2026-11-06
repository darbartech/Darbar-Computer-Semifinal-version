# 06 — API & Data Layer Guide

The patterns every module follows. Code is **illustrative TypeScript** — adapt names to the versions you install (🔎 = check current docs).

---

## 1. The five-layer rule

```
Page / Component  →  Server Action (writes) ┐
(server component)→  DAL read function      ├→  Prisma  →  PostgreSQL
                                            ┘
  Client components only receive props or call Server Actions.
```

| Layer | Location | Allowed to… | Must never… |
|-------|----------|-------------|-------------|
| Validators | `src/lib/validators/*` | define Zod schemas (importable by client & server) | import Prisma |
| DAL | `src/server/dal/*` | call Prisma, apply visibility rules, map to view types | be imported by a client component |
| Actions | `src/server/actions/*` (`"use server"`) | auth check, validate, call DAL, audit, revalidate | trust any client input |
| Services | `src/server/services/*` | email, storage, rate limit, Turnstile, audit | contain business rules |
| UI | `src/app`, `src/components` | render, call actions | import `@/server/*` in a `"use client"` file |

Put `import "server-only";` at the top of everything in `src/server/` — the build fails if a client file imports it.

---

## 2. Prisma client (Prisma 7 + adapter) — `src/server/db.ts`

```ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";   // path = generator `output`

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;  // avoid many pools on hot reload
```

`prisma.config.ts` (🔎 verify keys for your Prisma version):

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

---

## 3. Session & permissions — `src/server/session.ts`

```ts
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";                       // your auth-library instance
import type { Role } from "@/generated/prisma/client";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });   // 🔎 API differs per auth library
}

export async function requireUser() {
  const s = await getSession();
  if (!s?.user || !s.user.isActive) redirect("/admin/login");
  return s.user;
}

export async function requireRole(allowed: Role[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) throw new Error("FORBIDDEN");   // caught by the action wrapper
  return user;
}
```

`src/server/permissions.ts`:

```ts
export const PERMISSIONS = {
  "lead.read":      ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "lead.update":    ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "lead.export":    ["SUPER_ADMIN", "ADMIN"],
  "lead.delete":    ["SUPER_ADMIN"],
  "course.write":   ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "course.archive": ["SUPER_ADMIN", "ADMIN"],
  "settings.write": ["SUPER_ADMIN", "ADMIN"],
  "user.manage":    ["SUPER_ADMIN"],
  // …one line per action; mirrors the matrix in 05
} as const satisfies Record<string, readonly string[]>;

export type Permission = keyof typeof PERMISSIONS;
```

```ts
export async function requirePermission(p: Permission) {
  return requireRole([...PERMISSIONS[p]] as Role[]);
}
```

---

## 4. Validators — `src/lib/validators/lead.ts`

Move the existing `CreateLeadSchema` here and extend it. The same schema powers `react-hook-form` in the browser and the Server Action.

```ts
import { z } from "zod";

export const inquirySchema = z.object({
  fullName: z.string().trim().min(2).max(100)
    .regex(/^[\p{L}\s.'-]+$/u, "Letters, spaces, . ' - only"),   // \p{L}: also allows Nepali names
  phone: z.string().trim().min(7).max(20).regex(/^[+\d\s()-]+$/),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  courseSlug: z.string().optional(),
  preferredBatch: z.enum(["MORNING","DAY","EVENING","WEEKEND","ANY"]).default("ANY"),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { error: "Please accept the privacy notice" }),
  // hidden fields
  website: z.string().max(0).optional(),        // honeypot — must stay empty
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  turnstileToken: z.string().min(1),
});
export type InquiryInput = z.infer<typeof inquirySchema>;
```

> ⚠ The current regex `^[a-zA-Z\s.'-]+$` **rejects Nepali/Devanagari names** and accented characters. The `\p{L}` form above accepts any letter. Also note `batch` values change from lowercase (`"morning"`) to enum casing — update the select options.
> The project resolves Zod **4.x** (see `01`, P1), so `z.literal(true, { error })` below is correct. 🔎 It is Zod 4 syntax; on Zod 3 use `{ errorMap }` / `message`. Check the version `npm i zod` installs.

---

## 5. DAL read with cache — `src/server/dal/courses.ts`

```ts
import "server-only";
import { db } from "../db";
import { cached } from "../cache";
import { toCourseView } from "./mappers";

export const listPublishedCourses = cached(
  ["courses"],                                   // cache tag(s)
  async () => {
    const rows = await db.course.findMany({
      where: { status: "PUBLISHED" },
      include: { category: true, cover: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.map(toCourseView);               // returns the SAME shape components already use
  },
);

export const getPublishedCourseBySlug = (slug: string) =>
  cached([`course:${slug}`, "courses"], async () => {
    const row = await db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: { category: true, cover: true },
    });
    return row ? toCourseView(row) : null;
  })();
```

`src/server/cache.ts` — **the only file that knows which caching API you use** (🔎 decide using the Next.js 16 caching docs: `"use cache"` + `cacheTag`, or `unstable_cache`):

```ts
import "server-only";
import { unstable_cache } from "next/cache";

export function cached<A extends unknown[], R>(tags: string[], fn: (...a: A) => Promise<R>) {
  return unstable_cache(fn, tags, { tags, revalidate: 3600 });   // 1 h safety-net
}
```
```ts
// src/server/revalidate.ts — the only place that calls revalidate* (🔎 Next 16: signature/profile args changed)
import "server-only";
import { revalidateTag } from "next/cache";
export function invalidate(...tags: string[]) { tags.forEach((t) => revalidateTag(t, "max")); }
```

Mapper `dal/mappers.ts`:

```ts
import type { Course as CourseView } from "@/types/course";

const LEVEL_LABEL = { BEGINNER:"Beginner", BEGINNER_TO_INTERMEDIATE:"Beginner to Intermediate",
                      INTERMEDIATE:"Intermediate", ADVANCED:"Advanced" } as const;
const MODE_LABEL  = { PHYSICAL:"Physical", ONLINE:"Online", HYBRID:"Hybrid" } as const;
const SLOT_LABEL  = { MORNING:"Morning", DAY:"Day", EVENING:"Evening", WEEKEND:"Weekend" } as const;

export function toCourseView(r: CourseRow): CourseView {
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category.name,
    tagline: r.tagline, shortDescription: r.shortDescription,
    level: LEVEL_LABEL[r.level],
    duration: `${r.durationWeeks} Weeks`,
    learningMode: r.learningModes.map((m) => MODE_LABEL[m]).join(" / "),
    timing: r.timeSlots.map((t) => SLOT_LABEL[t]).join(" / "),
    newBatch: r.batchFrequency ?? "",
    instituteCertificate: r.instituteCertificate,
    industryCertification: r.industryCertifications.join(", ") || undefined,
    internship: r.internship ?? undefined,
    targetStudents: r.targetStudents,
    skillsGained: r.skillsGained, softwareTools: r.softwareTools,
    portfolioProjects: r.portfolioProjects, careerOpportunities: r.careerOpportunities,
    image: r.cover?.url ?? "/images/placeholder-course.jpg",
    featured: r.isFeatured, feeNPR: r.feeNPR, feeNote: r.feeNote ?? undefined,
    seats: r.seatsNote ?? undefined, seoTitle: r.seoTitle ?? undefined,
    seoDescription: r.seoDescription ?? undefined, overview: r.overview ?? undefined,
    learningObjectives: r.learningObjectives, prerequisites: r.prerequisites ?? undefined,
    cta: r.ctaText ?? undefined,
  };
}
```
Same idea for events, posts, FAQ, gallery, testimonials, team, settings.

---

## 6. Using it in pages (fixing P2)

```tsx
// src/app/(public)/courses/page.tsx   — SERVER component
import { Suspense } from "react";
import CoursesClient from "./CoursesClient";
import { listPublishedCourses, listCategoryGroups } from "@/server/dal/courses";

export default async function CoursesPage() {
  const [courses, groups] = await Promise.all([listPublishedCourses(), listCategoryGroups()]);
  return (
    <Suspense fallback={/* existing fallback */ null}>
      <CoursesClient courses={courses} categoryGroups={groups} />
    </Suspense>
  );
}
```
```tsx
// CoursesClient.tsx — "use client": delete `import { courses } from "@/content/courses"`,
// accept `{ courses, categoryGroups }: Props`, and use them in the existing useMemo filter.
```

```tsx
// src/app/(public)/courses/[slug]/page.tsx  (Next 16: params is a Promise)
export function generateStaticParams() {
  return safeStaticParams("/courses/[slug]", listPublishedCourseSlugs);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();
  /* existing JSX unchanged */
}
```

Same prop-passing pattern for: `Header`/`WhatsAppButton` (settings from `(public)/layout.tsx`), `TestimonialCarousel`, `GalleryClient`, `CategoryDirectory`, `AdmissionInquiryForm` (course options).

### 6.1 Prerender lists — how they actually work

Three things differ from the sketch above, and each has a test in `tests/static-generation.test.ts`
that fails if it drifts back:

- **The list is slug-only.** `listPublishedCourseSlugs`, `listPublishedBlogSlugs` and
  `listPublishedEventSlugs` use `select: { slug: true }` with no `take`. The whole-record reads
  behind the listing pages are capped at `PUBLIC_LIST_LIMIT`, so reusing them for prerendering
  quietly limited the archive to one page and fetched columns the keys never needed.
- **The list cannot fail the build.** Every `generateStaticParams` goes through
  `safeStaticParams(route, read)` (`src/lib/static-params.ts`): a database that is not reachable at
  build time logs one warning and returns `[]`, so `next build` still succeeds and the pages
  generate on request. An unguarded `await` there fails the whole build.
- **`/courses` is static.** The page reads nothing from the request; `CoursesClient` seeds its
  search/category/level controls from `useSearchParams()` in an effect after hydration and writes
  the URL back with `router.replace`. Awaiting the query string on the server made every visit —
  filtered or not — render dynamically, which is what the `5m` window in the build report now buys
  back.

One public detail route stays dynamic on purpose: `/courses/[slug]` renders `CourseEnrollArea`,
which reads the session through `headers()` to choose between "Enroll" and "Sign in", so it cannot
be prerendered even though it exports a prerender list.

### 6.2 Ceilings on reads

Nothing in the admin or public trees may say "give me every row", because the row count is the
future:

- **Un-paginated pickers are capped at `ADMIN_PICKER_LIMIT`** (`src/server/constants.ts`) — course
  dropdowns, batch instructors, assignment rosters, lead assignees. Tables page at 20–25 and are
  covered by their own `PAGE_SIZE`.
- **A capped list is never the denominator.** `assignmentListSelect` asks for
  `_count: { select: { recipients: true } }` so "3/24 submitted" still says 24 when the id list
  behind it stopped at the ceiling.
- **A truncated human-facing list says so.** `listStudentsForAdmin` reads `LIMIT + 1`, drops the
  extra row and returns `{ rows, truncated }`; the students page turns `truncated` into a notice
  telling the user to narrow the filter. Silent truncation is how a bulk action ends up aimed at
  the wrong cohort.
- **Aggregate numbers come from SQL.** `getDuesSummary()` is one grouped `SELECT`
  (`duesAgingQuery`) rather than a load of every open invoice, and the bucket boundaries are the
  same `dayUtc()` values `agingWhere()` uses, so the aging chips and the filtered list cannot
  disagree. The boundaries cross the wire as `YYYY-MM-DD` text (`dayKeyUtc`) compared with
  `::date`, never as a `Date` — a zone-less timestamp is the one thing this driver mangles.
  `tests/fees.test.ts` compares the aggregate against the old per-row `agingOf()` loop on the same
  fixture, and a `::bigint` column arrives as a JS `BigInt` that the DAL narrows to integer NPR.
- **Parallel where independent.** The home page awaits settings, featured courses, testimonials and
  FAQs in one `Promise.all`.
- **Bulk ids are capped in Zod** — lead status/stage (100), lead delete (50), assignment recipients
  (500, a course roster), invoice installments (60). 500 stays above the 200 the brief suggested
  because it is the size of a whole course, not a page of the UI.
- **Receipt PDFs are metered, not cached** (docs/05 §4). Caching would let a voided payment keep
  printing as a real receipt, so the file stays per-request and `RECEIPT_DOWNLOAD_LIMIT` charges
  each account 40 renders per five minutes instead; both routes answer 429 after their auth checks.

---

## 7. Server Action template (admin write)

```ts
"use server";
import "server-only";
import { z } from "zod";
import { db } from "../db";
import { requirePermission } from "../session";
import { audit } from "../services/audit";
import { invalidate } from "../revalidate";
import { courseSchema } from "@/lib/validators/course";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateCourse(id: string, input: unknown): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await requirePermission("course.write");            // 1. who are you?
    const parsed = courseSchema.safeParse(input);                    // 2. is the data valid?
    if (!parsed.success)
      return { ok: false, error: "Please fix the highlighted fields",
               fieldErrors: z.flattenError(parsed.error).fieldErrors };   // 🔎 Zod 4; Zod 3: parsed.error.flatten()

    const before = await db.course.findUnique({ where: { id }, select: { slug: true, status: true } });
    if (!before) return { ok: false, error: "Course not found" };

    const course = await db.course.update({ where: { id }, data: toPrismaData(parsed.data) });  // 3. write
    await audit({ actor: user, action: "course.update", entity: "Course", entityId: id,
                  summary: course.title, meta: { before, after: { slug: course.slug, status: course.status } } }); // 4. audit
    invalidate("courses", `course:${before.slug}`, `course:${course.slug}`);                      // 5. go live
    return { ok: true, data: { slug: course.slug } };
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") return { ok: false, error: "You don't have permission" };
    console.error("[updateCourse]", e instanceof Error ? e.message : "unknown");   // no personal data in logs
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
```
Handle unique-slug errors (Prisma error code `P2002`) and return a friendly field error.

**Sixth step for irreversible writes** (docs/08 §"Step-up"): a void, a certificate issue or
revoke, a role/email change, a privileged account create, an activate/deactivate, a staff
password-reset link, a 2FA reset, a user delete, a day reopen, or a settings save that moves a
sensitive field adds
`await requireStepUp(user, purpose, input)` between validation and the write, and returns
`{ ok: false, error: stepUp.error }` when it refuses. The two `stepUp*` fields stay out of the
business schema — `requireStepUp` reads them off the raw payload, so a caller who forgets them
gets a refusal rather than a silent pass. It goes after the permission check, the Zod parse and
the existence check, and before the write, so a request that could never have succeeded never
spends one of the code's 30 seconds or one of the account's throttle credits.

**Lock order in the money path** (`src/server/dal/fees.ts`): every writer takes the campus
day's Postgres advisory lock first — `SELECT pg_advisory_xact_lock(hashtext('dayclose:<yyyy-mm-dd>'))`
— and only then the invoice row lock (`SELECT … FOR UPDATE`). The day lock is what makes the
close atomic: `closeDay` counts the day's receipts and writes the `DayClose` row inside it, and
`recordPayment`, `voidPayment` and `reopenDay` do their closed-day check and write inside the same
key, so a receipt can never land between the count and the row and a day can never be reopened
under a receipt still in flight. It has to be advisory because a day is not a row — the first
close of a day has no `DayClose` to lock. One order everywhere, so two clerks working the same
day and the same bill cannot deadlock.

**Revalidation map** (use the same names everywhere):

| Mutation | Invalidate tags |
|----------|-----------------|
| course create/update/archive | `courses`, `course:<slug>`, `sitemap` |
| category change | `courses`, `categories` |
| settings change | `settings` (header, footer, about, JSON-LD) |
| blog post | `blog`, `post:<slug>`, `sitemap` |
| event | `events`, `event:<slug>`, `sitemap` |
| FAQ | `faq` |
| gallery | `gallery` |
| testimonial / team | `testimonials` / `team` |
| lead status change | `dashboard` |

---

## 8. Public form action (no login, abuse-prone)

```ts
"use server";
import { headers } from "next/headers";
import { inquirySchema } from "@/lib/validators/lead";

export async function submitInquiry(input: unknown): Promise<ActionResult<null>> {
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: /* flatten */ {} };
  const d = parsed.data;

  if (d.website) return { ok: true, data: null };                       // honeypot hit → pretend success, store nothing

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = hash(ip + process.env.AUTH_SECRET);                    // salted hash, never the raw IP

  if (!(await verifyTurnstile(d.turnstileToken, ip))) return { ok: false, error: "Verification failed" };
  if (!(await allow(`inquiry:${ipHash}`, { max: 5, windowMinutes: 60 })))
    return { ok: false, error: "Too many requests. Please try again later." };

  const course = d.courseSlug
    ? await db.course.findUnique({ where: { slug: d.courseSlug }, select: { id: true, title: true } })
    : null;

  const lead = await db.lead.create({ data: {
    fullName: d.fullName, phone: d.phone, email: d.email || null,
    courseId: course?.id, courseTitle: course?.title,
    preferredBatch: d.preferredBatch, message: d.message || null,
    utmSource: d.utmSource, utmMedium: d.utmMedium, utmCampaign: d.utmCampaign,
    consentAt: new Date(), ipHash,
  }});

  void notifyNewLead(lead).catch((e) => console.error("[notifyNewLead]", e.message));   // never block the response
  invalidate("dashboard");
  return { ok: true, data: null };
}
```

Client side (inside the existing form): replace the stub body with
```ts
const res = await submitInquiry({ ...data, turnstileToken });
if (!res.ok) { toast({ title: res.error, variant: "destructive" }); return; }
setSubmitted(true); reset();
```
and delete the `mailto:` branch.

---

## 9. Route Handlers (the only REST-style endpoints)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/upload/sign` | POST | `media.upload` | Returns signed Cloudinary upload params; enforces folder, max size, allowed MIME types. Permission and rate limit are checked **before the body is read**, so a caller who will be refused cannot make the server parse their payload (same order as `/api/upload/local`). Rate-limited per user (60 signatures / 10 min) and **not audited** — issuing a signature changes nothing, and `media.upload` records the file that arrives afterwards |
| `/api/leads/export` | GET | `lead.export` | Streams CSV; writes audit entry |
| `/api/health` | GET | none | `SELECT 1` check for uptime monitor (no details) |

Everything else is Server Actions. If a mobile app is added later, add `/api/v1/*` Route Handlers that call the **same DAL**.

---

## 10. Admin list pattern (filters in the URL)

```tsx
// /admin/leads/page.tsx — Next 16: searchParams is a Promise
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const sp = await searchParams;
  const filters = leadFilterSchema.parse({ q: sp.q, status: sp.status, page: sp.page ?? "1" }); // coerces + defaults
  const user = await requirePermission("lead.read");
  const { rows, total } = await adminListLeads(user, filters);   // DAL applies "counselor sees own/unassigned" here
  return <LeadsTable rows={rows} total={total} filters={filters} />;
}
```
Filters live in the URL → shareable, back-button friendly, no client state to sync.

---

## 11. Error handling & logging

- Actions return `ActionResult`; they **do not throw to the UI**. Only unexpected errors are logged (message only).
- Add `error.tsx` and `not-found.tsx` to `(public)` and `admin/(protected)`.
- Use one logger wrapper; never log request bodies of public forms (they contain phone/email).
- Optional: Sentry (or similar) for production errors, with PII scrubbing on.

## 12. Testing the layer

- **Unit:** validators (valid + invalid), mappers (DB row → view type snapshot), permissions matrix (`PERMISSIONS` vs `05`), slug helper.
- **Integration:** DAL against a throwaway Postgres (docker service in CI) — e.g. "COUNSELOR can't read another counselor's lead".
- **E2E (Playwright):** inquiry → lead visible in admin; edit course → public page updated; EDITOR blocked from `/admin/leads` and from calling the lead action.
