# 09 — AI-Assisted Build Prompts

Ready-to-paste prompts for Claude Code, Cursor, Trae, or any coding assistant. The project already contains `AGENTS.md` / `CLAUDE.md`, so this fits your workflow.

**How to use**
1. Put the `docs/` folder in the repo root so the assistant can read it.
2. Add the **project rules** (§1) to `AGENTS.md` (and keep `CLAUDE.md` pointing to it with `@AGENTS.md`).
3. Run **one prompt at a time**, in order. Review the diff, run `npm run lint && npm run typecheck && npm run build`, commit, then continue.
4. Never ask for "the whole admin panel" in one go — vertical slices (one module) give far fewer errors.

---

## 1. Project rules to add to `AGENTS.md`

```md
## Dynamic-site conventions (DarbarTech)
- Source of truth for the plan: docs/00-README.md … docs/09. Read the relevant doc BEFORE coding a phase.
- This Next.js version has breaking changes: read node_modules/next/dist/docs/ for any API you use
  (caching, server actions, proxy.ts [replaces middleware.ts], params/searchParams are Promises).
  Prisma 7 + driver adapter: confirm against current Prisma docs.
- Never import Prisma or anything from src/server/* in a "use client" file. Put `import "server-only"` in src/server/*.
- Pages call DAL functions (src/server/dal/*); never db.* directly in pages/components.
- Every Server Action: requirePermission() → Zod safeParse → DAL write → audit() → invalidate(tags) → return ActionResult.
- Client components receive data via props. Do not import src/content/* in new code.
- Keep all public URLs unchanged. Keep existing component visuals; change data sources, not design.
- Placeholder/unverified content is seeded as DRAFT/unpublished.
- Money = integer NPR. Dates = UTC in DB, displayed in Asia/Kathmandu.
- Do not log personal data (phone/email/message bodies).
- After each task: run lint, typecheck, build; list files changed and anything left undone.
```

---

## 2. Prompts by phase

### Phase 0 — cleanup
```
Read docs/01-current-site-analysis.md and docs/04-roadmap.md (Phase 0).
Do Phase 0 only:
1) fix the validation stack: install zod@4 and @hookform/resolvers@5 as direct dependencies (zod is currently only transitive, and @hookform/resolvers 3.10 is incompatible with zod 4 — zodResolver throws), then verify all four forms show inline errors for invalid input; 2) delete lib/app/ after verifying nothing imports it;
3) move app/ to src/app/ and fix any path/config issues (components.json css path);
4) add .nvmrc, engines, typecheck script, .env.example (from docs/02 §6), docker-compose.yml with Postgres;
5) add .github/workflows/ci.yml from docs/08 §3 (without Playwright for now).
Do not change any UI or content. At the end run lint, typecheck, build and report the results.
```

### Phase 1.1–1.2 — database + layout split
```
Read docs/02, docs/03 and docs/04 (Phase 1.1–1.2). First read the installed Next.js docs about route groups and the current Prisma 7 + Next.js setup.
1) Install Prisma pinned to major 7 (prisma@7, @prisma/client@7, @prisma/adapter-pg@7 — do NOT use the npm `latest` tag, it may point to an 8.x release candidate), plus pg, dotenv, tsx. Create prisma/schema.prisma EXACTLY as in docs/03 §2, prisma.config.ts, src/server/db.ts (with import "server-only").
2) Run the first migration "init".
3) Split layouts: src/app/layout.tsx minimal (html/body/font/globals/ToastProvider); create src/app/(public)/layout.tsx with Header, Footer, WhatsAppButton and JSON-LD; move all existing public pages into (public)/ without changing URLs.
Verify every existing route still renders and metadata is unchanged. Do not touch content files yet.
```

### Phase 1.3–1.4 — auth + admin shell
```
Read docs/02 §4, docs/05 §2–3, docs/06 §3 and docs/08 §1 (authentication).
Check the current recommended auth library for new Next.js 16 projects (Better Auth vs Auth.js) and tell me which one you pick and why BEFORE installing.
Then implement: auth config bound to Prisma (public sign-up disabled), src/server/session.ts (getSession/requireUser/requireRole), src/server/permissions.ts, src/proxy.ts redirecting /admin/* to /admin/login, the /admin/login page using existing UI components, and src/app/admin/(protected)/layout.tsx with sidebar (role-filtered items from docs/05 §3) and top bar. Seed script creates the first SUPER_ADMIN from env vars.
Add a unit test proving a non-admin role cannot pass requireRole for admin-only permissions.
```

### Phase 1.5 — media
```
Read docs/04 (Phase 1.5) and docs/08 §1 (Uploads). Implement the media library: /api/upload/sign route (role-checked, MIME + size limits), ImagePicker component, /admin/media page, Media DAL + actions with audit logging, and add the storage host to images.remotePatterns in next.config.mjs. Alt text is required.
```

### Phase 2 — leads
```
Read docs/04 (Phase 2), docs/05 §4.1–4.3, docs/06 §4 and §8.
Implement in this order, committing after each: (a) move form Zod schemas to src/lib/validators and extend per docs/06 §4 (allow Nepali names, consent, honeypot, UTM fields); (b) server actions submitInquiry, submitContact, subscribeNewsletter with honeypot, Turnstile, DB rate limit, email notification that never blocks the response; (c) update AdmissionInquiryForm and ContactForm to call the actions and remove the console.log/mailto stubs; the course dropdown must receive courses as a prop; (d) admin Leads list + detail + activity timeline + status/assign/follow-up per docs/05; (e) contact messages and subscribers pages; (f) CSV export route.
Write a Playwright test: submit inquiry → lead visible in admin.
```

### Phase 3 — courses (the pattern for everything else)
```
Read docs/03, docs/06 §5–7, docs/07 §1–4 and docs/04 (Phase 3).
1) Write prisma/seed.ts for CategoryGroup, Category and the 37 Courses per docs/07 (idempotent). Run it and verify counts 6/15/37 and 8 featured.
2) Write src/server/dal/courses.ts, mappers.ts (toCourseView returns the existing Course type), cache.ts and revalidate.ts.
3) Switch these to the DAL: /courses (server page passes props to CoursesClient — remove the content import), /courses/[slug], home featured courses, footer popular courses, inquiry form options, sitemap.
4) Build /admin/courses (list, new, edit with the tabs from docs/05 §4.4) and /admin/categories. Server actions follow the template in docs/06 §7 including audit + tag invalidation.
5) Write scripts/verify-seed.ts (docs/07 §4) and run it.
Acceptance: editing a course in admin updates the public pages within seconds; archived course → 404.
```

### Phase 4 — each content module (repeat per module)
```
Using the Courses implementation as the reference pattern, implement the <MODULE> module end to end: seed (placeholders as DRAFT), DAL + mapper, switch the public pages that use it, admin list/new/edit screens per docs/05 §4.<N>, server actions with permission/audit/revalidation, and tests. Module-specific rules are in docs/04 Phase 4 table. Do not change visuals of public pages.
```
Run it with `<MODULE>` = Site settings → Events → Blog → FAQ → Gallery → Testimonials → Team → Users → Audit log.

### Phase 5 — dashboard
```
Read docs/05 §5 and docs/03 (indexes). Implement src/server/dal/dashboard.ts and the /admin dashboard: KPI cards, the 5 charts, and lists, with role-based variants. Use one raw SQL date_trunc query in Asia/Kathmandu for per-day counts. Cache widgets 1–5 min, invalidate the "dashboard" tag on lead changes. Add a test that dashboard numbers equal counts from the leads table for a seeded dataset.
```

### Phase 6 — hardening
```
Read docs/08 §1–2. Audit the codebase against the security checklist: list every Server Action and confirm each starts with requirePermission; add security headers (CSP in report-only first); add noindex for /admin and /student; fix robots.ts and sitemap.ts; add the PERMISSIONS matrix unit test and the Playwright scenarios from §2. Output a table of findings (OK / fixed / needs decision).
```

---

## 3. Prompting tips for this codebase

- **Always point to the doc section** (e.g. "docs/06 §7") — it keeps the assistant on the agreed patterns.
- Ask it to **state assumptions and version-specific APIs it verified** (Next 16 caching, Prisma 7, Zod 4 vs 3, auth library).
- If it proposes a new dependency, ask "why not use what's already in the project?"
- Ask for **small PRs**: one module or one layer per prompt.
- When something breaks, give it the exact error and the file, not a description.
- Review security-relevant diffs yourself: auth, permissions, uploads, public form actions.
