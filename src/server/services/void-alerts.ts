import "server-only";
import { db } from "@/server/db";
import { notifyAdminVoid } from "@/server/services/email";

/**
 * "Who just removed money from the books?" — answered by email, not only by an
 * audit row nobody reads until the end of the month (fix guide §11).
 *
 * Both void paths call this through `after()`, so the SMTP round trip happens
 * after the admin's own response and a dead provider cannot make a completed
 * void look like a failure. Nothing in here throws into the caller: the money
 * has already moved and the audit entry already exists, which are the two things
 * that actually matter.
 *
 * Only the numbers and the reason go out — no student name, no contact details.
 * Anyone who needs the person's side of it opens the link.
 */
export async function notifyVoided(input: {
  kind: "invoice" | "receipt";
  id: string;
  reason: string;
  byEmail: string;
}): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;
    const to = admins.map((admin) => admin.email);

    if (input.kind === "invoice") {
      const invoice = await db.invoice.findUnique({
        where: { id: input.id },
        select: { id: true, number: true, netAmount: true },
      });
      if (!invoice) return;

      const result = await notifyAdminVoid({
        to,
        what: `Invoice ${invoice.number}`,
        amountNpr: invoice.netAmount,
        reason: input.reason,
        byEmail: input.byEmail,
        at: new Date(),
        id: invoice.id,
      });
      if (!result.sent) console.error("[void-alert] not sent", result.reason);
      return;
    }

    const receipt = await db.payment.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        invoiceId: true,
        invoice: { select: { number: true } },
      },
    });
    if (!receipt) return;

    const result = await notifyAdminVoid({
      to,
      what: `Receipt ${receipt.receiptNo} on invoice ${receipt.invoice.number}`,
      amountNpr: receipt.amount,
      reason: input.reason,
      byEmail: input.byEmail,
      at: new Date(),
      // The receipt itself has no admin page; the bill it was paid against does.
      id: receipt.invoiceId,
    });
    if (!result.sent) console.error("[void-alert] not sent", result.reason);
  } catch (error) {
    console.error("[void-alert]", error instanceof Error ? error.message : "unknown");
  }
}
