import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sequence numbers (docs 02 B2). The whole point of the `Counter` upsert is that
 * the increment happens in the database, so these tests check the contract with
 * the SQL rather than a reimplementation of it: which key is touched, whether a
 * read consumes the value, and what happens at the year's ceiling.
 */

const counters = vi.hoisted(() => ({ store: {} as Record<string, number>, lastSql: "" }));

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(" ");
      counters.lastSql = sql;
      const key = values[0] as string;
      if (sql.includes("ON CONFLICT")) {
        counters.store[key] = (counters.store[key] ?? 0) + 1;
        return [{ value: counters.store[key] }];
      }
      const current = counters.store[key];
      return current === undefined ? [] : [{ value: current }];
    },
  },
}));

const { nextSequence, peekSequence, retryOnUniqueViolation, isP2002 } = await import(
  "@/server/dal/counters"
);
const { generateCertificateNumber, peekCertificateNumber } = await import(
  "@/server/certificates/issuance"
);
const { generateStudentCode } = await import("@/server/dal/students");

beforeEach(() => {
  counters.store = {};
  counters.lastSql = "";
});

describe("nextSequence", () => {
  it("increments the named key and returns the new value", async () => {
    expect(await nextSequence("cert:2026")).toBe(1);
    expect(await nextSequence("cert:2026")).toBe(2);
    expect(counters.store["cert:2026"]).toBe(2);
  });

  it("keeps one counter per key", async () => {
    await nextSequence("cert:2026");
    expect(await nextSequence("student:2026")).toBe(1);
  });

  it("refuses to invent a number when the database returns nothing", async () => {
    const broken = { $queryRaw: async () => [] } as never;
    await expect(nextSequence("cert:2026", broken)).rejects.toThrow(
      'Sequence "cert:2026" did not return a value'
    );
  });
});

describe("peekSequence", () => {
  it("reads without consuming", async () => {
    await nextSequence("cert:2026");
    expect(await peekSequence("cert:2026")).toBe(1);
    expect(await peekSequence("cert:2026")).toBe(1);
    expect(await nextSequence("cert:2026")).toBe(2);
  });

  it("reports zero for a year that has not issued anything", async () => {
    expect(await peekSequence("cert:2031")).toBe(0);
  });
});

describe("certificate numbers", () => {
  /** `DT-CERT-<year>-<sequence>-<suffix>` (docs 01 §S7). */
  const SHAPE = /^DT-CERT-2026-00001-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/;

  it("are zero-padded, carry the year and end in a random suffix", async () => {
    const first = await generateCertificateNumber(2026);
    expect(first).toMatch(SHAPE);
    expect(await generateCertificateNumber(2026)).toMatch(
      /^DT-CERT-2026-00002-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/
    );
    expect(counters.lastSql).toContain('"Counter"');
  });

  it("do not repeat a suffix, which is what makes the series unwalkable", async () => {
    const suffixes = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      suffixes.add((await generateCertificateNumber(2026)).slice(-4));
    }
    expect(suffixes.size).toBeGreaterThan(45);
  });

  it("skip the characters that get misread off a printout", async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await generateCertificateNumber(2026)).slice(-4)).not.toMatch(/[ILOU01]/);
    }
  });

  it("still match the shape the public search accepts", async () => {
    const { CERTIFICATE_NUMBER_PATTERN } = await import("@/lib/certificate-reference");
    const generated = await generateCertificateNumber(2026);
    expect(CERTIFICATE_NUMBER_PATTERN.test(generated)).toBe(true);
    // Numbers issued before the suffix existed keep verifying.
    expect(CERTIFICATE_NUMBER_PATTERN.test("DT-CERT-2026-00017")).toBe(true);
  });

  it("stop at the ceiling instead of overflowing the padded field", async () => {
    counters.store["cert:2026"] = 99_999;
    await expect(generateCertificateNumber(2026)).rejects.toThrow(/exhausted/i);
  });

  it("preview the next number without burning it", async () => {
    const preview = await peekCertificateNumber(2027);
    expect(preview).toMatch(/^DT-CERT-2027-00001-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/);
    expect((await peekCertificateNumber(2027)).slice(0, -5)).toBe(preview.slice(0, -5));
    expect(counters.store["cert:2027"]).toBeUndefined();

    const issued = await generateCertificateNumber(2027);
    expect(issued.slice(0, -5)).toBe("DT-CERT-2027-00001");
  });
});

describe("student codes", () => {
  it("use the same counter shape under a different key", async () => {
    expect(await generateStudentCode(2026)).toBe("DT-STU-2026-00001");
    expect(await generateStudentCode(2026)).toBe("DT-STU-2026-00002");
    expect(counters.store["student:2026"]).toBe(2);
  });

  it("stop at the ceiling", async () => {
    counters.store["student:2026"] = 99_999;
    await expect(generateStudentCode(2026)).rejects.toThrow(/exhausted/i);
  });
});

describe("retryOnUniqueViolation", () => {
  it("rebuilds once after a collision", async () => {
    let attempts = 0;
    const result = await retryOnUniqueViolation(async () => {
      attempts += 1;
      if (attempts === 1) throw { code: "P2002" };
      return attempts;
    });
    expect(result).toBe(2);
  });

  it("does not retry anything else", async () => {
    let attempts = 0;
    await expect(
      retryOnUniqueViolation(async () => {
        attempts += 1;
        throw new Error("connection lost");
      })
    ).rejects.toThrow("connection lost");
    expect(attempts).toBe(1);
  });

  it("recognises only the unique-constraint code", () => {
    expect(isP2002({ code: "P2002" })).toBe(true);
    expect(isP2002({ code: "P2003" })).toBe(false);
    expect(isP2002(new Error("x"))).toBe(false);
  });
});
