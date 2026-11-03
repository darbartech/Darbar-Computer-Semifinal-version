# Darbar Computer

Next.js site backed by PostgreSQL and Prisma. Public pages and the admin panel
read through the DAL in `src/server/dal/`; the database must be reachable before
`npm run dev` will render anything.

## Local development

1. **Start PostgreSQL** (must match `DATABASE_URL` in `.env`):
   - With Docker: `docker compose up -d`
   - On Windows without Docker: `npm run db:init` (one time — downloads a
     user-mode PostgreSQL, no admin rights needed), then `npm run db:start`.
     This cluster listens on **127.0.0.1:5433** (`-Port 5433`), because a system
     PostgreSQL service often already owns 5432; `.env` must use
     `postgresql://darbar:darbar@127.0.0.1:5433/darbar`.
2. **Apply migrations and seed** (first run, and after pulling schema changes):
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
3. **Run the app**: `npm run dev` → http://localhost:3001 (port 3000 is often
   taken by another service; `next dev` picks 3001 automatically)

Stop the user-mode database with `npm run db:stop`; check it with
`npm run db:status`. If the page logs
`Can't reach database server`, the database is not running.

The seed creates the super admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
in `.env`. Change that password after the first sign-in.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright (needs the database) |
| `npm run db:migrate` | Create a migration in development |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Seed catalog, settings and admin |
| `npm run verify:seed` | Compare seeded rows with the baseline |
