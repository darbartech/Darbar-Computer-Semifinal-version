import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { persistCertificatePdf } from "@/server/certificates/pdf/generator";
import type { PdfCertificateData } from "@/server/certificates/pdf/types";

/**
 * Regression: certificates could not be downloaded.
 *
 * `persistCertificatePdf` used to prefix the stored URL with `NEXT_PUBLIC_SITE_URL`,
 * so a `next dev` server running on :3001 stored links to :3000 and those 404'd. The
 * stored value must stay origin-free. It is now a key under the private PDF directory
 * rather than a `/uploads/` URL, because a URL under `public/` is served to anyone
 * without a session.
 */
const PDF_DIR = path.join("storage", "certificates");

/** Maps a stored `/certificates/...` key onto its file under the private root. */
function absOf(key: string): string {
  return path.join("storage", key.replace(/^\//, ""));
}

function makeData(overrides: Partial<PdfCertificateData> = {}): PdfCertificateData {
  return {
    id: "clx0000000000000000000000",
    certificateNumber: "DT-CERT-2026-0001",
    verificationToken: "tok0000000000000000000000000000",
    recipientName: "Raj Kumar Shrestha",
    courseName: "Career Track: AI Automation Specialist",
    issueDateIso: "2026-10-06T00:00:00.000Z",
    verificationUrl: "https://darbarcomputer.edu.np/verify/tok0000000000000000000000000000",
    items: [{ order: 0, title: "Module One", subtitle: null, shortLabel: null }],
    issuedSignatories: [],
    ...overrides,
  };
}

describe("certificate PDF persistence", () => {
  let previousSiteUrl: string | undefined;
  let previousProvider: string | undefined;
  const created: string[] = [];

  beforeAll(async () => {
    previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    previousProvider = process.env.MEDIA_STORAGE_PROVIDER;
    // Deliberately wrong on purpose: the stored URL must not depend on it.
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.MEDIA_STORAGE_PROVIDER = "local";
  });

  afterAll(async () => {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    if (previousProvider === undefined) delete process.env.MEDIA_STORAGE_PROVIDER;
    else process.env.MEDIA_STORAGE_PROVIDER = previousProvider;
  });

  it("stores a private key that does not leak the site origin", async () => {
    const result = await persistCertificatePdf(makeData(), Buffer.from("%PDF-1.4 test"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pdfUrl.startsWith("/certificates/")).toBe(true);
    expect(result.pdfUrl).not.toMatch(/^https?:\/\//i);
    expect(result.pdfUrl).not.toContain("localhost:3000");
    expect(result.pdfUrl).not.toContain("uploads");
    created.push(result.pdfUrl);
  });

  it("actually writes the file the URL points at", async () => {
    const result = await persistCertificatePdf(
      makeData({ certificateNumber: "DT-CERT-2026-0002" }),
      Buffer.from("%PDF-1.4 payload")
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The key maps 1:1 onto the private storage directory.
    const abs = absOf(result.pdfUrl);
    const info = await stat(abs);
    expect(info.size).toBeGreaterThan(0);
    created.push(result.pdfUrl);

    // And it lives under the date-stamped sub-directory that the URL advertises.
    const day = new Date().toISOString().slice(0, 10);
    expect(result.pdfUrl).toContain(`/${day}/`);
  });

  it("gives each certificate a unique filename", async () => {
    const a = await persistCertificatePdf(
      makeData({ certificateNumber: "DT-CERT-2026-0003" }),
      Buffer.from("%PDF-a")
    );
    const b = await persistCertificatePdf(
      makeData({ certificateNumber: "DT-CERT-2026-0003" }),
      Buffer.from("%PDF-b")
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.pdfUrl).not.toBe(b.pdfUrl);
    created.push(a.pdfUrl, b.pdfUrl);
  });

  it("sanitises recipient names out of the path", async () => {
    const result = await persistCertificatePdf(
      makeData({ recipientName: "../../etc/passwd" }),
      Buffer.from("%PDF-x")
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pdfUrl).not.toContain("..");
    expect(result.pdfUrl).toMatch(/^\/certificates\/[\w-]+\/[\w.-]+\.pdf$/);
    created.push(result.pdfUrl);
  });

  it("keeps every persisted key inside the private certificate directory", async () => {
    for (const url of created) {
      const resolved = path.resolve(absOf(url));
      const root = path.resolve(PDF_DIR);
      expect(resolved.startsWith(root)).toBe(true);
    }
    expect(created.length).toBeGreaterThan(0);
  });

  it("removes the PDFs it created", async () => {
    for (const url of created) {
      await rm(absOf(url), { force: true });
    }
    // Only prune the directory when this suite emptied it.
    try {
      const days = await readdir(PDF_DIR);
      let total = 0;
      for (const d of days) {
        const entries = await readdir(path.join(PDF_DIR, d));
        total += entries.filter((e) => e.endsWith(".pdf")).length;
      }
      if (total === 0) await rm(PDF_DIR, { recursive: true, force: true });
    } catch {
      // directory already gone
    }
  });
});
