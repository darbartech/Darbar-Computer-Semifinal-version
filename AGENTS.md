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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
