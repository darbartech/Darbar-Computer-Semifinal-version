import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Public certificate verification (docs 01 §S7, §S12).
 *
 * The property under test is that the search box stops being an oracle: a printed
 * number alone must never unlock a record, a wrong name must answer exactly like an
 * unknown number, and the name handed back to a text search is masked. The token path
 * keeps its old behaviour — 24 random bytes are their own second factor.
 */

type CertificateRow = {
  id: string;
  certificateNumber: string | null;
  verificationToken: string | null;
  status: string;
  recipientName: string;
  courseName: string;
  issueDate: Date | null;
  issuedAt: Date | null;
  revokedAt: Date | null;
  reissuedAt: Date | null;
  items: Array<{ order: number; title: string; subtitle: string | null }>;
  issuedSignatories: Array<{ name: string; title: string; displayOrder: number }>;
};

const store = vi.hoisted(() => ({
  rows: [] as unknown[],
  cachedTags: [] as string[],
}));

function certificateRow(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "cert-1",
    certificateNumber: "DT-CERT-2026-00017-K7Q2",
    verificationToken: "abcd1234EFGH5678-ijkl9012",
    status: "ISSUED",
    recipientName: "Ram Sharma",
    courseName: "Digital Literacy Essentials",
    issueDate: new Date("2026-09-01T00:00:00.000Z"),
    issuedAt: new Date("2026-09-01T05:30:00.000Z"),
    revokedAt: null,
    reissuedAt: null,
    items: [{ order: 0, title: "Module One", subtitle: null }],
    issuedSignatories: [{ name: "Sita Karki", title: "Director", displayOrder: 0 }],
    ...overrides,
  };
}

vi.mock("@/server/db", () => ({
  db: {
    certificate: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const statuses = (where.status as { in?: string[] }).in ?? [];
        const row = store.rows.find((candidate) => {
          const row = candidate as CertificateRow;
          if (!statuses.includes(row.status)) return false;
          if (
            where.certificateNumber !== undefined &&
            row.certificateNumber !== where.certificateNumber
          ) {
            return false;
          }
          if (
            where.verificationToken !== undefined &&
            row.verificationToken !== where.verificationToken
          ) {
            return false;
          }
          return true;
        });
        return row ? { ...(row as CertificateRow) } : null;
      },
    },
  },
}));

/**
 * The cache wrapper is Next's, not ours — these tests assert which reads are cached,
 * not how `unstable_cache` behaves. `findPublicCertificateByNumberAndName` must not go
 * through it at all, which the identity mock below makes visible.
 */
vi.mock("@/server/cache", () => ({
  cached: (tags: readonly string[], fn: (...args: never[]) => Promise<unknown>) => {
    store.cachedTags.push(tags.join(","));
    return fn;
  },
}));

const {
  isCertificateNumber,
  maskRecipientName,
  normalizeCertificateNumber,
  normalizePersonName,
  tokenFromReference,
} = await import("@/lib/certificate-reference");
const { certificateSearchFormSchema, certificateSearchSchema } = await import(
  "@/lib/validators/certificates"
);
const { findPublicCertificateByNumberAndName } = await import(
  "@/server/dal/certificates/certificates.dal"
);

const TOKEN = "abcd1234EFGH5678-ijkl9012";

beforeEach(() => {
  store.rows = [certificateRow()];
});

describe("certificate reference shapes", () => {
  it("recognises a token, bare or inside a pasted verification link", () => {
    expect(tokenFromReference(TOKEN)).toBe(TOKEN);
    expect(tokenFromReference(`https://darbarcomputer.edu.np/verify/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromReference(`  https://site.test/verify/${TOKEN}/ `)).toBe(TOKEN);
    expect(tokenFromReference("DT-CERT-2026-00017-K7Q2")).toBeNull();
    expect(tokenFromReference("short")).toBeNull();
  });

  it("normalises a typed number without touching its meaning", () => {
    expect(normalizeCertificateNumber(" dt-cert-2026-00017-k7q2 ")).toBe(
      "DT-CERT-2026-00017-K7Q2"
    );
    expect(isCertificateNumber("dt-cert-2026-00017-k7q2")).toBe(true);
    expect(isCertificateNumber("DT-CERT-2026-00017")).toBe(true);
    expect(isCertificateNumber("DT-CERT-2026-00017-K7Q2-extra")).toBe(false);
    expect(isCertificateNumber(TOKEN)).toBe(false);
  });

  it("compares names ignoring case, spacing, punctuation and accents", () => {
    expect(normalizePersonName("  RAM   sharma ")).toBe("ram sharma");
    expect(normalizePersonName("Ram Sharmb")).not.toBe(normalizePersonName("Ram Sharma"));
    // What an employer retypes from a printed card (reaudit N11).
    expect(normalizePersonName("Ram-Bahadur  Thapa.")).toBe(normalizePersonName("ram bahadur thapa"));
    expect(normalizePersonName("Hélène Pérez")).toBe(normalizePersonName("Helene Perez"));
    expect(normalizePersonName("O’Brien")).toBe(normalizePersonName("OBrien"));
    // Tolerance never becomes a partial match: a shorter name still fails.
    expect(normalizePersonName("Ram Thapa")).not.toBe(normalizePersonName("Ram Bahadur Thapa"));
    // Devanagari keeps its vowel signs.
    expect(normalizePersonName("राम शर्मा")).toBe("राम शर्मा");
  });

  it("masks the family name but keeps it recognisable", () => {
    expect(maskRecipientName("Ram Sharma")).toBe("Ram S****a");
    expect(maskRecipientName("Aayara Shrestha")).toBe("Aayara S******a");
    expect(maskRecipientName("Ram")).toBe("R*m");
    expect(maskRecipientName("Li")).toBe("L*");
    expect(maskRecipientName("")).toBe("");
  });
});

describe("certificate search schema", () => {
  it("demands a name for a certificate number", () => {
    const parsed = certificateSearchFormSchema.safeParse({
      code: "DT-CERT-2026-00017-K7Q2",
      recipientName: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toContain("recipientName");
    }
  });

  it("accepts a number plus the name it was issued to", () => {
    const parsed = certificateSearchFormSchema.safeParse({
      code: "DT-CERT-2026-00017-K7Q2",
      recipientName: "Ram Sharma",
    });
    expect(parsed.success).toBe(true);
  });

  it("never asks for a name next to a token", () => {
    for (const code of [TOKEN, `https://darbarcomputer.edu.np/verify/${TOKEN}`]) {
      const parsed = certificateSearchFormSchema.safeParse({ code, recipientName: "" });
      expect(parsed.success, code).toBe(true);
    }
  });

  it("rejects a reference that is neither shape before touching the database", () => {
    const parsed = certificateSearchFormSchema.safeParse({
      code: "1",
      recipientName: "Ram Sharma",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toContain("code");
    }
  });

  it("only the server copy requires the anti-spam token", () => {
    const withoutToken = {
      code: "DT-CERT-2026-00017-K7Q2",
      recipientName: "Ram Sharma",
    };
    expect(certificateSearchFormSchema.safeParse(withoutToken).success).toBe(true);

    const server = certificateSearchSchema.safeParse(withoutToken);
    expect(server.success).toBe(false);
    if (!server.success) {
      expect(server.error.issues.map((issue) => issue.path[0])).toContain("turnstileToken");
    }
    expect(
      certificateSearchSchema.safeParse({ ...withoutToken, turnstileToken: "t" }).success
    ).toBe(true);
  });
});

describe("lookup by number and name", () => {
  it("returns a masked record when both halves match", async () => {
    const view = await findPublicCertificateByNumberAndName(
      " dt-cert-2026-00017-k7q2 ",
      "ram   SHARMA"
    );
    expect(view).not.toBeNull();
    expect(view?.recipientName).toBe("Ram S****a");
    expect(view?.certificateNumber).toBe("DT-CERT-2026-00017-K7Q2");
  });

  it("answers an unknown number and a wrong name identically", async () => {
    const wrongName = await findPublicCertificateByNumberAndName(
      "DT-CERT-2026-00017-K7Q2",
      "Ram Shrestha"
    );
    const unknownNumber = await findPublicCertificateByNumberAndName(
      "DT-CERT-2026-99999-ZZZZ",
      "Ram Sharma"
    );
    expect(wrongName).toBeNull();
    expect(unknownNumber).toBeNull();
  });

  it("will not serve a draft, and will not be wrapped in the verify cache", async () => {
    store.rows = [certificateRow({ status: "DRAFT" })];
    expect(
      await findPublicCertificateByNumberAndName("DT-CERT-2026-00017-K7Q2", "Ram Sharma")
    ).toBeNull();

    // Only the token read may hold a verify cache entry; transitive imports
    // register their own tags, so filter to the ones that matter.
    expect(store.cachedTags.filter((tags) => tags.includes("verify"))).toEqual([
      "certificates,certificates:list,verify",
    ]);
  });
});
