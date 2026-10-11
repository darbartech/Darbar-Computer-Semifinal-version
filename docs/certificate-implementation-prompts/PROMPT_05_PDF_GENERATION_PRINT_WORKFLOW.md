# PROMPT 5: PDF GENERATION & PRINT WORKFLOW
# Paste this entire prompt to implement server-side PDF generation

## CONTEXT
Verification (Prompt 4) done. Add print-ready PDF generation with design fidelity.

## MISSION
Server-only PDF generator for A4 landscape 297×210mm @300PPI, vector-first, QR to `/verify/[token]`, bleed-aware. Trigger on issue/regenerate.

## REQUIRED READING FIRST
1. `AGENTS.md`
2. `certificate-docs/02_PSD_TEMPLATE_MAPPING_AND_PRINT_SPEC.md`
3. `certificate-docs/Design Document/01_DOCUMENT_AND_PRINT_SPEC.md`
4. `certificate-docs/Design Document/04_ZONE_BY_ZONE_ELEMENT_MAP.md`
5. `certificate-docs/Design Document/07_FONT_LICENSING_AND_ASSETS.md`
6. Prompt 1-2 (issue action will trigger PDF)

## STRICT CONSTRAINTS
- Server-only (`import "server-only"` everywhere)
- No client imports
- A4 landscape 297×210mm, 300PPI target
- Vector text where practical, high-res/vector QR
- Use zone map positions (no arbitrary redesign)
- QR → `https://<official-domain>/verify/<opaque-token>`
- Additive-only (assets under public/ only if needed, no overwrite)
- Respect font licensing
- No PII in logs
- Do not commit

## TASKS

### TASK 1: Directory Structure
Create:
- `src/server/certificates/pdf/`
  - `generator.ts`, `renderers/layout.ts`, `renderers/qr.ts`, `fonts.ts`, `types.ts`
- `src/server/certificates/utils.ts`

### TASK 2: PDF Engine
Choose headless rendering (Playwright/Puppeteer). If not present, add minimal devDependency if needed. Render HTML+CSS with print styles, export PDF A4 landscape.

### TASK 3: Layout & QR
Implement zone-based layout from zone map. Generate SVG QR (preferred). Absolute positioning for print accuracy.

### TASK 4: Fonts & Assets
Load/embed allowed fonts per licensing. Add assets to `public/` additively only if required; prefer SVG logos.

### TASK 5: Integration
- On `issueCertificateAction`: generate PDF after setting ISSUED (safe: don't revert on PDF failure; log non-PII error)
- On `regenerateCertificatePdfAction`: regenerate
- Store PDF reference (pdfUrl/pdfPath) on Certificate if schema has optional field (or add via additive field awareness from Prompt 1)

### TASK 6: Error Handling
Non-blocking on generation failure (log safely). Memory-conscious.

## VERIFICATION GATES
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## OUTPUT
Files created, engine choice, integration notes, gate results

## DONE WHEN
Gates pass. PDF generation integrated with issue/regenerate.
