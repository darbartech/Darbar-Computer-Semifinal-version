import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * reaudit N14, second half — the printed slip.
 *
 * A red "VOID" across a receipt proves the money was taken back but not by whom,
 * so the person holding the paper cannot tell a mistyped entry from a refund. The
 * ledger already stores `voidedById`; these tests pin the last mile, which is that
 * the PDF renderer is actually handed the name, the day and the reason.
 */

const renderReceiptPdf = vi.fn();

vi.mock("@/server/fees/receipt-pdf", () => ({
  renderReceiptPdf: (data: unknown) => renderReceiptPdf(data),
}));

vi.mock("@/server/dal/settings", () => ({
  getSiteSettings: async () => ({
    general: { name: "Darbar Computer Institute", logoUrl: null },
    contact: { address: "Kathmandu" },
    fees: { bankDetails: null, receiptFooter: null },
  }),
}));

vi.mock("@/server/dal/fees", () => ({
  getBalanceAfterReceipt: async () => 8000,
}));

const { receiptPdfResponse } = await import("@/server/fees/receipt-serve");
const { paymentMethodLabel } = await import("@/lib/validators/fees");

const VOIDED_ON = new Date("2026-11-04T09:30:00.000Z");

function documentWith(payment: Record<string, unknown>) {
  return {
    id: "pay-1",
    receiptNo: "RCPT-2026-00004",
    amount: 2000,
    method: "CASH",
    reference: null,
    status: "VOIDED",
    receivedAt: new Date("2026-11-01T05:00:00.000Z"),
    invoiceId: "inv-1",
    receivedBy: { name: "Bikash Shrestha" },
    invoice: {
      id: "inv-1",
      studentId: "stu-1",
      number: "INV-2026-00002",
      title: "Second installment",
      netAmount: 10000,
      student: {
        studentCode: "DT-STD-2026-00004",
        user: { name: "Anisha Gurung" },
      },
      enrollment: { course: { title: "Diploma in IT" }, batch: { name: "Evening 2026" } },
    },
    ...payment,
  } as never;
}

beforeEach(() => {
  renderReceiptPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 test"));
});

describe("a voided receipt", () => {
  it("carries who undid it, when and why", async () => {
    await receiptPdfResponse(
      documentWith({
        voidedAt: VOIDED_ON,
        voidedBy: { name: "Sunita Karki" },
        voidReason: "Cash counted twice at the desk",
      })
    );

    expect(renderReceiptPdf).toHaveBeenCalledTimes(1);
    const data = renderReceiptPdf.mock.calls[0][0] as Record<string, unknown>;
    expect(data.voided).toBe(true);
    expect(data.voidedOn).toEqual(VOIDED_ON);
    expect(data.voidedByName).toBe("Sunita Karki");
    expect(data.voidReason).toBe("Cash counted twice at the desk");
    // The undoing does not rewrite what was taken: the slip still names the clerk
    // who received it, and the balance shown is the live one.
    expect(data.receivedByName).toBe("Bikash Shrestha");
    expect(data.balanceAfter).toBe(8000);
    expect(data.methodLabel).toBe(paymentMethodLabel("CASH"));
  });

  it("still prints when the void was recorded without a name or reason", async () => {
    // Old rows and system-driven voids have neither; the stamp must not stop the
    // page from rendering.
    await receiptPdfResponse(documentWith({ voidedAt: null, voidedBy: null, voidReason: null }));

    const data = renderReceiptPdf.mock.calls[0][0] as Record<string, unknown>;
    expect(data.voided).toBe(true);
    expect(data.voidedOn).toBeNull();
    expect(data.voidedByName).toBeNull();
    expect(data.voidReason).toBeNull();
  });

  it("leaves a live receipt unmarked", async () => {
    await receiptPdfResponse(
      documentWith({ status: "RECEIVED", voidedAt: null, voidedBy: null, voidReason: null })
    );

    const data = renderReceiptPdf.mock.calls[0][0] as Record<string, unknown>;
    expect(data.voided).toBe(false);
    expect(data.voidedByName).toBeNull();
  });

  it("is served as a private file, never a cached one", async () => {
    const response = await receiptPdfResponse(
      documentWith({ voidedAt: VOIDED_ON, voidedBy: { name: "Sunita Karki" }, voidReason: null })
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });
});
