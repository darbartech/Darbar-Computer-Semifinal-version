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
- [ ] Optional but recommended: 2FA (TOTP) for SUPER_ADMIN/ADMIN.
- [ ] Always ≥ 1 active SUPER_ADMIN (enforced in code).

### Authorisation
- [ ] **Every** Server Action and DAL write calls `requirePermission(...)` as its first line. (Server Actions are public HTTP endpoints.)
- [ ] `proxy.ts` and layouts redirect, but are **not** relied on for security.
- [ ] Counselor lead scoping enforced in the DAL query.
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
- [ ] No SVG uploads from editors (script risk) — or sanitise.
- [ ] Alt text required on every image.

### Public forms
- [ ] Honeypot + Cloudflare Turnstile + DB rate limit (5/hour/IP hash) + max field lengths.
- [ ] No raw IP stored (salted hash only). Consent checkbox and timestamp.
- [ ] Email notifications escape user text (no HTML injection into staff emails).

### Platform
- [ ] Security headers in `next.config.mjs`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (admin) / `frame-ancestors`, `Permissions-Policy`, HSTS (at proxy). Start CSP in **report-only** mode, then enforce.
- [ ] `robots.ts` disallows `/admin` and `/api`; admin pages send `noindex`.
- [ ] Secrets only in environment variables / host secret store; `.env*` git-ignored (already true); rotate if ever exposed.
- [ ] Dependencies: `npm audit` in CI, Dependabot/Renovate enabled; lockfile committed.
- [ ] Database: dedicated app user with least privilege (no superuser); not exposed to the public internet (private network or IP allow-list); TLS enabled.
- [ ] Backups encrypted and stored off the server.

### Privacy
- [ ] Privacy notice linked from every form; define a **retention period** for leads (e.g. delete or anonymise spam after 30 days, lost leads after 12–24 months) — implement as a scheduled job.
- [ ] Testimonial/gallery photos: written consent recorded (`consentGiven` + note).
- [ ] Confirm the legal requirements for storing personal data in Nepal with someone qualified; this document is not legal advice.

---

## 2. Testing plan

| Level | Tool | What to cover | Run |
|-------|------|---------------|-----|
| Unit | Vitest | Zod validators (valid/invalid/Nepali names), mappers (`toCourseView` snapshot), slugify, `PERMISSIONS` matrix, formatters | every commit |
| Integration | Vitest + real Postgres (docker service) | DAL queries: visibility (draft hidden), counselor scoping, unique slug conflict, cascade rules | every PR |
| End-to-end | Playwright | (1) visitor submits inquiry → staff sees lead; (2) admin edits course fee → public page updates; (3) archived course → 404; (4) EDITOR can't open `/admin/leads` and action call is rejected; (5) login/logout; (6) contact form spam honeypot; (7) mobile viewport smoke | PR + before deploy |
| Accessibility | axe (Playwright) | public pages + admin login, lead list | PR |
| Performance | Lighthouse CI | `/`, `/courses`, `/courses/[slug]` — scores not lower than the pre-migration baseline (record baseline in Phase 0) | weekly / release |
| Manual UAT | Checklist | Staff perform real tasks: add a course, publish a post, handle a lead | before go-live |

Test data: a `prisma/seed-test.ts` creating one user per role + sample leads.

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

**Monitoring**
- Uptime check on `/api/health` and the home page (e.g. UptimeRobot / Better Stack) with email/SMS alert.
- Error tracking (Sentry or equivalent), PII scrubbing on.
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
- [ ] `/admin` and `/student/*` are `noindex`; student stubs removed from the sitemap.
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
