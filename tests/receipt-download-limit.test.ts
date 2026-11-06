import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Task 5 — the receipt routes render a PDF per request, which is the right thing
 * (a voided payment must print VOIDED immediately) but also an unbounded amount
 * of work on a URL whose only secret is a `Payment.id`. Both routes now spend a
 * slot on a per-account counter first, so scanning the id space has a price.
 *
 * `receipt-serve` itself is NOT mocked — only its inputs — because the limit it
 * exports is part of what these tests assert.
 */

const calls = vi.hoisted(() => ({
  allow: [] as { key: string; max: number; windowMinutes: number }[],
  allowed: true,
  forbid: false,
  documents: 0,
  document: null as unknown,
  rendered: 0,
}));

vi.mock("@/server/session", () => ({
  requirePermission: async () => {
    if (calls.forbid) throw new Error("FORBIDDEN");
    return { id: "staff-1", email: "accounts@example.test" };
  },
  isRedirectError: (error: unknown) =>
    error instanceof Error && error.message === "NEXT_REDIRECT",
}));

vi.mock("@/server/student-session", () => ({
  requireStudentProfile: async () => ({
    user: { id: "user-9", name: "Test Student" },
    profile: { id: "stu-1", studentCode: "DC-0001" },
  }),
}));

vi.mock("@/server/services/rate-limit", () => ({
  allow: async (key: string, options: { max: number; windowMinutes: number }) => {
    calls.allow.push({ key, ...options });
    return calls.allowed;
  },
}));

vi.mock("@/server/dal/fees", () => ({
  getReceiptDocument: async () => {
    calls.documents += 1;
    return calls.document;
  },
  getBalanceAfterReceipt: async () => 45_000,
}));

vi.mock("@/server/dal/settings", () => ({
  getSiteSettings: async () => ({
    general: { name: "Darbar Computer", logoUrl: null },
    contact: { address: "Kathmandu" },
    fees: { bankDetails: null, receiptFooter: "Thank you." },
  }),
}));

vi.mock("@/server/fees/receipt-pdf", () => ({
  renderReceiptPdf: async () => {
    calls.rendered += 1;
    return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  },
}));

const { RECEIPT_DOWNLOAD_LIMIT } = await import("@/server/fees/receipt-serve");
const { GET: staffReceipt } = await import(
  "@/app/api/techdarbar/payments/[id]/receipt/route"
);
const { GET: studentReceipt } = await import(
  "@/app/api/student/payments/[id]/receipt/route"
);

function ownDocument() {
  return {
    id: "pay-1",
    invoiceId: "inv-1",
    receiptNo: "R-2026-0001",
    amount: 5_000,
    method: "CASH",
    reference: null,
    status: "RECEIVED",
    receivedAt: new Date("2026-11-01T10:00:00Z"),
    voidedAt: null,
    voidReason: null,
    receivedBy: { name: "Front desk" },
    voidedBy: null,
    invoice: {
      number: "INV-2026-0001",
      title: "Course fees",
      studentId: "stu-1",
      student: { studentCode: "DC-0001", user: { name: "Test Student" } },
      enrollment: null,
    },
  };
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

const params = Promise.resolve({ id: "pay-1" });

beforeEach(() => {
  calls.allow = [];
  calls.allowed = true;
  calls.forbid = false;
  calls.documents = 0;
  calls.document = ownDocument();
  calls.rendered = 0;
});

describe("GET /api/techdarbar/payments/[id]/receipt", () => {
  it("serves the PDF and spends one slot on the staff account", async () => {
    const response = await staffReceipt(request("/api/techdarbar/payments/pay-1/receipt"), {
      params,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    // Keyed by the account, not the address: the whole office shares one IP.
    expect(calls.allow).toEqual([
      { key: "receipt:staff-1", ...RECEIPT_DOWNLOAD_LIMIT },
    ]);
  });

  it("429s once the counter is full and renders nothing", async () => {
    calls.allowed = false;
    const response = await staffReceipt(request("/api/techdarbar/payments/pay-1/receipt"), {
      params,
    });

    expect(response.status).toBe(429);
    expect(calls.documents).toBe(0);
    expect(calls.rendered).toBe(0);
  });

  it("checks the limit after the permission, so a refusal costs no slot", async () => {
    calls.forbid = true;
    const response = await staffReceipt(request("/api/techdarbar/payments/pay-1/receipt"), {
      params,
    });

    expect(response.status).toBe(403);
    expect(calls.allow).toHaveLength(0);
  });
});

describe("GET /api/student/payments/[id]/receipt", () => {
  it("spends a slot on the student profile before reading the ledger", async () => {
    const response = await studentReceipt(request("/api/student/payments/pay-1/receipt"), {
      params,
    });

    expect(response.status).toBe(200);
    expect(calls.allow).toEqual([
      { key: "receipt:stu-1", ...RECEIPT_DOWNLOAD_LIMIT },
    ]);
  });

  it("counts a not-found as a download, so probing ids has a price", async () => {
    calls.document = { ...ownDocument(), invoice: { ...ownDocument().invoice, studentId: "stu-2" } };
    const response = await studentReceipt(request("/api/student/payments/pay-2/receipt"), {
      params,
    });

    expect(response.status).toBe(404);
    expect(calls.allow).toHaveLength(1);

    calls.allowed = false;
    const blocked = await studentReceipt(request("/api/student/payments/pay-3/receipt"), {
      params,
    });
    expect(blocked.status).toBe(429);
    expect(calls.documents).toBe(1);
  });
});
