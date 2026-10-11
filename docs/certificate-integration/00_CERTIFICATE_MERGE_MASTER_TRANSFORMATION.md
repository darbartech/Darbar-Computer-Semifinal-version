# DarbarTech Certificate System Merge — Master Transformation Document

**Status:** Master Reference  
**Version:** 1.0  
**Date:** 2026-10-04  
**Scope:** Non-breaking merge of DarbarTech_Programmable_Certificate_System into Darbar-Computer-Semifinal-version

## 1. Executive Summary

This document consolidates analysis, constraints, mapping, and an executable phase-wise plan to merge the programmable certificate system into the existing DarbarTech codebase **without breaking existing functionality**.

The certificate system (extracted at `certificate-docs/`) is specification-driven: master spec, PSD zone mapping, print specs, Supabase migrations, admin UI, and public verification. The main app follows strict conventions: Next.js App Router, Prisma 7 + PostgreSQL, DAL + Server Actions, RBAC, audit logging, cache invalidation, and "source of truth is DB; src/content/* is seed/reference only".

**Recommended approach:** Re-implement the certificate feature on top of the main project's architecture (Prisma + DAL + Server Actions + Zod + RBAC + audit + cache). Keep all existing routes, tables, components, and URLs intact. Add certificate functionality in an additive-only manner.

## 2. Non-Negotiable Requirements

### 2.1 Design & Print Fidelity
- Match approved PSD (`certificate-docs/CERTIFICATE psd.psd`) using zone mapping (`certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`).
- Target: A4 landscape 297 × 210 mm @ 300 PPI (master PSD ~3508×2480 px).
- Vector text where practical; preserve logo/artwork quality; high-resolution/vector QR.
- Respect fonts/licensing (`certificate-docs/Design Document/07_FONT_LICENSING_AND_ASSETS.md`).
- Support bleed if required (3mm) and consider PDF/X-4 for print workflows.
- Do not redesign, change logo, color hierarchy, fonts, or replace with generic HTML template.
- Do not rasterize the entire certificate as a single low-res screenshot.

### 2.2 Data-Driven & Immutable
- All dynamic fields sourced from structured data.
- Never require "manual edit after generate" as normal workflow.
- Generate immutable certificate snapshot on issue (store rendered metadata + PDF path/hash if applicable).
- Certificate number format: `DT-CERT-YYYY-XXXXX` (preserve existing convention from specs).

### 2.3 Verification & Privacy
- Every issued certificate must have a unique **opaque** verification token.
- Public URL **must remain exactly**: `/verify/[token]` (from certificate specs).
- Token must not expose PII.
- Public verification must reveal **minimum** necessary info to establish authenticity.
- **Never** expose publicly: phone, email, address, citizenship/National ID, DOB (unless explicitly approved), guardian, payment, internal student ID, attendance, internal remarks, private assessment, admin notes.

### 2.4 Security, Audit, RBAC
- All mutating operations via Server Actions only (no new public REST mutators).
- Every Server Action: `requirePermission()` → Zod `safeParse` → DAL write → `audit()` → `invalidate(tags)` → return `ActionResult`.
- Enforce RBAC using existing roles (`SUPER_ADMIN`, `ADMIN`, `EDITOR`, `COUNSELOR`). Map certificate capabilities conservatively.
- Audit all lifecycle actions: create, update, issue, revoke, reissue, regenerate PDF, delete (where allowed). Log actor, action, target id, timestamp, non-PII metadata.
- Do not log PII (names/phones/emails/token values in verbose console logs).
- Follow existing auth/session model. Do not duplicate auth tables unnecessarily.

### 2.5 Conventions (Must Follow)
- **Prisma 7** is source of truth. Add certificate models/enums to `prisma/schema.prisma` only additively.
- `src/server/dal/*` for all DB access; never `db.*` in pages/components.
- `import "server-only"` in all server modules (DAL, server actions, PDF generators).
- Client components receive data via props. No server-only imports in client.
- Pages use DAL functions (not direct Prisma) for reads.
- Cache tags must be invalidated after successful writes.
- Preserve public URLs and existing component visuals. Change data sources, not design.
- Money = integer NPR (if fees ever involved). Dates = UTC in DB, display in `Asia/Kathmandu` where shown.
- After every phase: `npm run lint && npm run typecheck && npm run build`. List files changed.
- **Do not commit** unless explicitly requested.

## 3. Deep Analysis: Main vs Certificate System

### 3.1 Main Project (Darbar-Computer-Semifinal-version)
- Next.js App Router + TypeScript
- Prisma 7 + PostgreSQL
- RBAC roles: SUPER_ADMIN, ADMIN, EDITOR, COUNSELOR
- Admin UI under `/admin/*` (courses, leads, media, settings, users)
- Server Actions + DAL pattern established
- Audit + cache invalidation infrastructure exists
- Cloudinary media integration
- Public pages read via DAL

### 3.2 Certificate System (certificate-docs/)
- Next.js App Router + TypeScript
- Supabase (Postgres) with SQL migrations (13 files: 001–013)
- Admin: `/admin/certificates/*` (list/new/[id])
- Public: `/verify/[token]`
- Tables: `certificates`, `certificate_signatories`, `certificate_templates`, `courses` (enhanced), `admin_users`, `admin_sessions`, `audit_logs`, `verification_tokens`, `mfa_*`, `outbox`, `certificate_revisions`, etc.
- Strong specs: master implementation spec, design parity docs, zone map, print spec, QA checklist.
- Privacy-first verification, reissue/revoke, constraints/indexes.

### 3.3 Key Tables to Port (Supabase → Prisma)
From migrations 001–013: certificates, certificate_items (modules/subjects), certificate_signatories, certificate_issued_signatories (junction or snapshot), certificate_templates, courses (add certificate-related fields if missing), certificate_audits/revisions, verification_tokens, admin_users/sessions/MFA (prefer unify to existing auth), audit/outbox as applicable.

**Rule:** Additive only. Do not drop/rename existing Prisma models.

## 4. Integration Strategy (Approach C — Recommended)

Re-implement certificate module using existing architecture. 
- Translate SQL schema to Prisma models/enums (additive).
- Create `src/server/dal/certificates/` with PII-safe DTOs.
- Create Server Actions under `src/server/actions/certificates/` following same wrapper pattern as existing actions.
- Add admin UI pages under `src/app/admin/certificates/` matching existing admin styling (shadcn/ui, forms, tables).
- Add public verify route `src/app/verify/[token]/page.tsx` with server-side data fetch via DAL.
- Add server-only PDF generator (Playwright/Puppeteer) under `src/server/certificates/pdf/` or `src/server/lib/pdf/`.
- Wire RBAC via `requirePermission()`, audit via `audit()`, cache via `invalidate()` with appropriate tags.

**Rationale:** Preserves design fidelity, maintains single DB + unified auth/RBAC/audit, zero breaking changes, easier long-term maintenance.

## 5. File Map & References (Must Read)

**Main project:**
- `AGENTS.md` — conventions
- `docs/00-README.md`, `docs/02-CONTENT-SOURCE-OF-TRUTH.md`, `docs/03-ADMIN-MODULES.md`, `docs/04-SERVER-ACTION-AND-DAL-CONTRACT.md`
- `prisma/schema.prisma` — existing schema
- `src/server/dal/`, `src/server/actions/`, `src/lib/`, `src/app/admin/layout.tsx`, `src/app/admin/(components)/` or existing admin patterns
- `src/middleware.ts` or existing auth/RBAC utilities

**Certificate system (source of truth for feature):**
- `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md`
- `certificate-docs/01_REQUIRED_INFORMATION_AND_DECISIONS.md`
- `certificate-docs/02_PSD_TEMPLATE_MAPPING_AND_PRINT_SPEC.md`
- `certificate-docs/03_CERTIFICATE_SYSTEM_ARCHITECTURE.md`
- `certificate-docs/04_IMPLEMENTATION_TASKS_AND_ACCEPTANCE_TESTS.md`
- `certificate-docs/Design Document/00_EXECUTIVE_SUMMARY_AND_GAP_ANALYSIS.md`
- `certificate-docs/Design Document/01_DOCUMENT_AND_PRINT_SPEC.md`
- `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`
- `certificate-docs/Design Document/07_FONT_LICENSING_AND_ASSETS.md`
- `certificate-docs/Design Document/10_QA_CHECKLIST.md`
- `certificate-docs/supabase/migrations/*.sql` (001–013) — schema + constraints

## 6. Phased Execution Plan

Execute in order. Each phase is additive-only. Run gates after each.

| Phase | Title | Goal |
|---|---|---|
| 01 | Analyze & Establish Ground Truth | Read all refs, inventory, baseline (lint/typecheck/build), create checklist |
| 02 | Prisma Schema & Migrations Alignment | Add certificate models/enums/relations/indexes to `prisma/schema.prisma` (additive). Map 001–013. |
| 03 | Types, Zod, DAL | Create `src/server/dal/certificates/`, types, mappers, Zod schemas, PII-safe DTOs |
| 04 | Server Actions & Audit/Cache | Create actions with requirePermission→Zod→DAL→audit→invalidate→ActionResult |
| 05 | Admin UI Pages & Components | Add `/admin/certificates` (list/new/[id]) matching existing admin UI |
| 06 | Public Verification Route | Add `/verify/[token]` with minimal PII; preserve exact URL |
| 07 | PDF Generation & Print Workflow | Server-only print-ready PDF (A4 landscape @300PPI, vector text, QR, bleed-aware) |
| 08 | Templates, Signatories & Seed | Add seed support for signatories/templates (non-production) |
| 09 | Integration Hardening & Gates | Wire exports, RBAC, cache tags, PII boundaries, error handling |
| 10 | Final Verification & Rollout | Full gates + smoke + parity checklist + integration report |

## 7. Acceptance Criteria (Global)
- All existing functionality unchanged (routes, tables, auth, courses, leads, media, settings).
- No breaking changes to public URLs (except adding `/verify/[token]` and `/admin/certificates/*`).
- Verification never exposes disallowed PII.
- Print/PDF respects 300PPI and layout intent from PSD zones.
- All mutating actions audited; cache invalidated on writes.
- `npm run lint && npm run typecheck && npm run build` pass after each phase.
- Files changed listed per phase; no secrets committed.

## 8. Rollback Plan
- Changes are additive (new files/tables/enums). If issues arise, revert phase-specific changes.
- Prisma schema additions are backward compatible.
- No modifications to existing tables/columns/routes.
- Keep original certificate-docs/ untouched.
