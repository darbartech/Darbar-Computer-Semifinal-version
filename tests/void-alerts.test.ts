import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §11 — "Admin voids alert".
 *
 * A void takes money back out of a ledger that has already been counted, so the
 * people who own the accounts have to hear about it from somewhere other than an
 * audit row nobody reads. These tests run the real service against a stand-in
 * database and a stand-in mail provider: who is addressed, who is not, what the
 * letter says, and the rule that a failed alert must never disturb a completed
 * void.
 */

const state = vi.hoisted(() => ({
  admins: [] as string[],
  invoice: null as null | { id: string; number: string; netAmount: number },
  payment: null as null | {
    id: string;
    receiptNo: string;
    amount: number;
    invoiceId: string;
    invoice: { number: string };
  },
  boom: null as null | Error,
}));

const sent: Array<Record<string, unknown>> = [];

vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: unknown, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: "mail-1" }) };
  })
);

vi.mock("@/server/db", () => ({
  db: {
    user: {
      findMany: async () => {
        if (state.boom) throw state.boom;
        return state.admins.map((email) => ({ email }));
      },
    },
    invoice: {
      findUnique: async () => state.invoice,
    },
    payment: {
      findUnique: async () => state.payment,
    },
  },
}));

const { notifyVoided } = await import("@/server/services/void-alerts");
const { notifyAdminVoid } = await import("@/server/services/email");

const envKeys = ["RESEND_API_KEY", "MAIL_FROM", "NEXT_PUBLIC_SITE_URL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of envKeys) saved[key] = process.env[key];
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.MAIL_FROM = "DarbarTech <no-reply@darbar.test>";
  process.env.NEXT_PUBLIC_SITE_URL = "https://darbar.example";

  state.admins = ["owner@example.test", "second@example.test"];
  state.boom = null;
  state.invoice = { id: "inv-1", number: "FEE-2026-0007", netAmount: 25000 };
  state.payment = {
    id: "pay-1",
    receiptNo: "R-2026-0031",
    amount: 12000,
    invoiceId: "inv-1",
    invoice: { number: "FEE-2026-0007" },
  };
  sent.length = 0;
});

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("notifyVoided — invoice", () => {
  it("mails every super admin the number, the amount and the reason", async () => {
    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Billed the wrong batch",
      byEmail: "clerk@example.test",
    });

    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toEqual(["owner@example.test", "second@example.test"]);
    expect(mail.subject).toBe("Voided — Invoice FEE-2026-0007");
    const body = `${mail.html} ${mail.text}`;
    expect(body).toContain("NPR 25,000");
    expect(body).toContain("Billed the wrong batch");
    expect(body).toContain("clerk@example.test");
    expect(String(mail.html)).toContain(
      'href="https://darbar.example/techdarbar/fees/inv-1"'
    );
  });

  it("does not mail the person who just pressed the button", async () => {
    state.admins = ["owner@example.test", "second@example.test"];

    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Duplicate bill",
      byEmail: "owner@example.test",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["second@example.test"]);
  });

  it("sends nothing when the actor is the only super admin", async () => {
    state.admins = ["owner@example.test"];

    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Duplicate bill",
      byEmail: "owner@example.test",
    });

    expect(sent).toHaveLength(0);
  });

  it("sends nothing when the invoice is gone", async () => {
    state.invoice = null;

    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Duplicate bill",
      byEmail: "clerk@example.test",
    });

    expect(sent).toHaveLength(0);
  });
});

describe("notifyVoided — receipt", () => {
  it("names the receipt and the bill it was paid against", async () => {
    await notifyVoided({
      kind: "receipt",
      id: "pay-1",
      reason: "Slip belongs to another student",
      byEmail: "clerk@example.test",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(
      "Voided — Receipt R-2026-0031 on invoice FEE-2026-0007"
    );
    const body = `${sent[0].html} ${sent[0].text}`;
    expect(body).toContain("NPR 12,000");
    expect(body).toContain("Slip belongs to another student");
  });

  it("links to the invoice page, which is where a receipt is visible", async () => {
    await notifyVoided({
      kind: "receipt",
      id: "pay-1",
      reason: "Wrong amount",
      byEmail: "clerk@example.test",
    });

    expect(String(sent[0].html)).toContain(
      'href="https://darbar.example/techdarbar/fees/inv-1"'
    );
  });
});

describe("notifyVoided — never disturbs the void", () => {
  it("swallows a database failure", async () => {
    state.boom = new Error("connection lost");

    await expect(
      notifyVoided({
        kind: "invoice",
        id: "inv-1",
        reason: "Duplicate bill",
        byEmail: "clerk@example.test",
      })
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("logs and swallows a provider that will not send", async () => {
    delete process.env.RESEND_API_KEY;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Duplicate bill",
      byEmail: "clerk@example.test",
    });

    expect(sent).toHaveLength(0);
    expect(error).toHaveBeenCalledWith("[void-alert] not sent", expect.any(String));
    error.mockRestore();
  });

  it("returns without querying when there is nobody to tell", async () => {
    state.admins = [];

    await notifyVoided({
      kind: "invoice",
      id: "inv-1",
      reason: "Duplicate bill",
      byEmail: "clerk@example.test",
    });

    expect(sent).toHaveLength(0);
  });
});

describe("notifyAdminVoid — the letter itself", () => {
  it("escapes text that arrives from the reason field", async () => {
    const result = await notifyAdminVoid({
      to: ["owner@example.test"],
      what: "Invoice <b>FEE-2026-0007</b>",
      amountNpr: 1000,
      reason: '<script>alert("x")</script> & more',
      byEmail: "clerk@example.test",
      at: new Date("2026-11-06T02:00:00.000Z"),
      id: "inv-1",
    });

    expect(result).toEqual({ sent: true });
    const html = String(sent[0].html);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Invoice &lt;b&gt;FEE-2026-0007&lt;/b&gt;");
  });

  it("says the money stayed in the books rather than being deleted", async () => {
    await notifyAdminVoid({
      to: ["owner@example.test"],
      what: "Receipt R-2026-0031 on invoice FEE-2026-0007",
      amountNpr: 500,
      reason: "test",
      byEmail: "clerk@example.test",
      at: new Date("2026-11-06T02:00:00.000Z"),
      id: "inv-1",
    });

    const body = `${sent[0].html} ${sent[0].text}`;
    expect(body).toMatch("stays in the books marked as void");
    expect(body).toContain("2026-11-06T02:00:00.000Z");
  });

  it("reports no-recipients instead of sending to an empty list", async () => {
    const result = await notifyAdminVoid({
      to: ["clerk@example.test"],
      what: "Invoice FEE-2026-0007",
      amountNpr: null,
      reason: "test",
      byEmail: "clerk@example.test",
      at: new Date(),
      id: "inv-1",
    });

    expect(result).toEqual({ sent: false, reason: "no-recipients" });
    expect(sent).toHaveLength(0);
  });
});
