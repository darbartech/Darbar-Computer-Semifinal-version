# PHASE 07 — PDF Generation & Print Workflow
**Role:** Backend/Print Engineer  
**Execution Mode:** Autonomous (single-shot prompt)  
**Scope:** Additive-only. Server-only PDF generation with design fidelity (A4 landscape @300PPI). Do not commit.

## 1. Objective
Implement server-side, print-ready PDF generation for issued certificates following PSD/design specs: A4 landscape 297×210mm @300PPI, vector text where possible, high-res QR, bleed-aware, preserving layout from zone map.

## 2. Must-Read References (First)
1. `AGENTS.md`
2. `docs/certificate-integration/00_CERTIFICATE_MERGE_MASTER_TRANSFORMATION.md`
3. `certificate-docs/02_PSD_TEMPLATE_MAPPING_AND_PRINT_SPEC.md`
4. `certificate-docs/Design Document/01_DOCUMENT_AND_PRINT_SPEC.md`
5. `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`
6. `certificate-docs/Design Document/07_FONT_LICENSING_AND_ASSETS.md`
7. `certificate-docs/00_MASTER_CERTIFICATE_IMPLEMENTATION_SPEC.md`
8. Existing asset/media handling (Cloudinary) — `src/lib/cloudinary*` or media utils

## 3. Directory Structure (Additive)
Create:
- `src/server/certificates/` or `src/server/lib/certificates/`
- `src/server/certificates/pdf/`
  - `generator.ts` (main PDF generator)
  - `renderers/layout.ts` (zone-based layout helpers)
  - `renderers/qr.ts` (QR code generation)
  - `fonts.ts` (font loading)
  - `types.ts`
- `src/server/certificates/utils.ts`

All `server-only`. Never imported by client.

## 4. Print Specifications (Target)
- Format: A4 landscape
- Trim: 297 mm × 210 mm
- Resolution target: 300 PPI equivalent
- Master reference: 3508×2480 px @300 PPI (per PSD)
- Bleed: 3mm optional (configurable)
- Output: PDF (prefer PDF/X-4 if printer requires; configurable)
- Vector-first: text as vector, logo/artwork vector/SVG where possible
- QR: high-resolution/vector (SVG preferred)
- Avoid full-canvas rasterization of entire certificate unless absolutely necessary for complex artwork

## 5. Technology Choice
Select headless rendering suitable for server (Node). Common: Playwright (headless Chromium) or Puppeteer. Prefer approach already compatible with Next.js/server. If neither present, add as devDependency with minimal footprint. Do not bloat unnecessarily. Document choice in code comments.

Render HTML/CSS with print-safe styles (absolute positioning by zones) to match PSD layout, then export to PDF at A4 landscape with proper margins/bleed.

## 6. Layout Mapping
Use `Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md` and print spec:
- Header/branding zone
- Student name zone
- Course/title zone
- Date/issue/number zones
- Modules/items zone (if present)
- Signatories zones (with order, titles)
- QR zone (verification URL `/verify/[token]`)
- Decorative/shapes as vectors/SVG or high-res assets

Do not reposition elements arbitrarily.

## 7. Fonts & Assets
- Respect font licensing (07_FONT_LICENSING_AND_ASSETS.md). Only use licensed/allowed fonts.
- Load fonts server-side (embed subset if large).
- Use existing brand assets from `public/` or certificate assets (`certificate-docs/assets/`, `certificate-docs/public/`) as reference. Copy only needed assets to main `public/` additively (no overwrite of existing brand assets).
- Prefer SVG for logos/shapes.

## 8. QR Code
- Generate QR for verification URL: `https://<official-domain>/verify/<opaque-token>`
- Use high-res (SVG) or vector. Embed cleanly in QR zone.
- Do not encode PII.

## 9. Generation Flow
- Triggered on `issueCertificateAction` (after status set to ISSUED) and `regenerateCertificatePdfAction`
- Render certificate data (snapshot: issued signatories, frozen fields)
- Generate PDF to storage (local or existing storage strategy). Prefer existing media/storage (Cloudinary or filesystem in temp). Do not invent new public storage without checking existing.
- Store PDF path/reference on Certificate (add field only if needed? Phase 02 additive; can add `pdfUrl`/`pdfPath` string optional).
- Return PDF URL/path in result.

## 10. Template Strategy
HTML template per certificate layout (based on master). Keep template isolated, versionable. Avoid inline styles scattered; structured.

## 11. Error Handling & Performance
- Timeout-safe, server-only
- Graceful fallback; do not block issuance if PDF generation fails (queue or retry later) — log non-PII error
- Memory-conscious (300PPI large canvas) — render via print CSS/PDF export, not huge pixel buffers unless necessary

## 12. Implementation Rules
- Additive-only. No changes to existing code.
- `import "server-only"` in all files
- No client dependencies
- Do not log PII (names/tokens)
- Keep fonts/assets additive under `public/` only if needed (check duplicates)

## 13. Acceptance Criteria
- PDF generator creates A4 landscape PDF
- Vector text where practical; QR vector/high-res
- Matches zone positions per design doc (structure)
- Uses opaque token in QR → `/verify/[token]`
- Server-only; no client imports
- List files changed

## 14. Verification Gates (Must Pass)
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 15. Output Required
Summary, files created, approach (Playwright/Puppeteer or chosen), gates status.

## 16. Definition of Done
Gates pass. Proceed to Phase 08.
