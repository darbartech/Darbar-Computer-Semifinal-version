"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeIndianRupee, FileDown, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { issueInvoiceAction } from "@/server/actions/fees";
import { paymentMethodLabel } from "@/lib/validators/fees";
import { formatDateTime, formatNPR } from "@/lib/format";
import type { InvoiceDetail } from "@/server/types/fees";
import {
  AGING_SHORT_LABELS,
  AGING_VARIANT,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANT,
  dateOrDash,
} from "./status";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { VoidDialog, type VoidTarget } from "./VoidDialog";

type Props = {
  invoice: InvoiceDetail;
  aging: { bucket: keyof typeof AGING_VARIANT; daysOverdue: number | null };
  can: { issue: boolean; voidInvoice: boolean; record: boolean; voidPayment: boolean };
};

/**
 * One bill in full: the schedule it was sold on, every receipt against it, and the
 * three actions that can still happen to it. Everything else about an issued invoice
 * is immutable — the money is derived from the rows below, never typed in here.
 */
export function InvoiceDetailPanel({ invoice, aging, can }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [recording, setRecording] = React.useState(false);
  const [voidTarget, setVoidTarget] = React.useState<VoidTarget | null>(null);
  const [issuing, setIssuing] = React.useState(false);

  const payable = invoice.status === "ISSUED" || invoice.status === "PARTIAL";

  const onIssue = async () => {
    setIssuing(true);
    try {
      const result = await issueInvoiceAction({ id: invoice.id });
      if (!result.ok) {
        toast({ title: "Could not issue", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: `${invoice.number} issued`,
        description: "It is a bill now. Corrections need a void and a new invoice.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 p-5">
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-neutral-900">
                {invoice.number}
              </span>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "outline"}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </Badge>
              {payable && (
                <Badge variant={AGING_VARIANT[aging.bucket]}>
                  {AGING_SHORT_LABELS[aging.bucket]}
                  {aging.daysOverdue && aging.daysOverdue > 0 ? ` · ${aging.daysOverdue}d` : ""}
                </Badge>
              )}
            </p>
            <h2 className="text-lg font-semibold text-neutral-900">{invoice.title}</h2>
            <p className="text-sm text-neutral-600">
              <Link
                href={`/techdarbar/students/${invoice.studentId}`}
                className="font-medium text-neutral-800 hover:text-primary hover:underline"
              >
                {invoice.studentName}
              </Link>
              <span className="font-mono text-xs text-neutral-500"> · {invoice.studentCode}</span>
              {invoice.courseTitle && <span> · {invoice.courseTitle}</span>}
              {invoice.batchName && <span> · {invoice.batchName}</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {invoice.status === "DRAFT" && can.issue && (
              <Button type="button" size="sm" onClick={onIssue} disabled={issuing}>
                {issuing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Issue invoice
              </Button>
            )}
            {payable && can.record && (
              <Button type="button" size="sm" onClick={() => setRecording(true)}>
                <BadgeIndianRupee className="size-4" />
                Record payment
              </Button>
            )}
            {invoice.status !== "VOID" && can.voidInvoice && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive/80 hover:text-destructive"
                onClick={() =>
                  setVoidTarget({
                    kind: "invoice",
                    id: invoice.id,
                    subject: `${invoice.number} · ${invoice.studentName}`,
                  })
                }
              >
                <ShieldOff className="size-4" />
                Void
              </Button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-4">
          <Cell label="Gross fee" value={formatNPR(invoice.grossAmount)} />
          <Cell
            label="Discount"
            value={invoice.discountAmount > 0 ? `− ${formatNPR(invoice.discountAmount)}` : formatNPR(0)}
            hint={invoice.discountReason ?? undefined}
          />
          <Cell label="Net payable" value={formatNPR(invoice.netAmount)} strong />
          <Cell label="Received" value={formatNPR(invoice.paidAmount)} />
          <Cell
            label="Balance"
            value={formatNPR(invoice.balance)}
            strong={invoice.balance > 0}
            hint={invoice.balance === 0 ? "Paid in full" : undefined}
          />
          <Cell label="Due date" value={dateOrDash(invoice.dueDate)} />
          <Cell label="Created" value={formatDateTime(invoice.createdAt)} hint={invoice.createdByName ?? undefined} />
          <Cell label="Note" value={invoice.note || "—"} />
        </dl>

        {invoice.status === "VOID" && invoice.voidReason && (
          <p className="border-t border-neutral-100 bg-red-50 px-5 py-3 text-sm text-red-800">
            Voided: {invoice.voidReason}
          </p>
        )}
      </div>

      {invoice.installments.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <h3 className="border-b border-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-900">
            Instalment schedule
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoice.installments.map((row) => (
                  <tr key={row.seq}>
                    <td className="px-5 py-2.5 tabular-nums text-neutral-600">{row.seq}</td>
                    <td className="px-5 py-2.5 tabular-nums text-neutral-900">
                      {formatNPR(row.amount)}
                    </td>
                    <td className="px-5 py-2.5 text-neutral-600">{dateOrDash(row.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-neutral-100 px-5 py-2.5 text-xs text-neutral-500">
            The schedule is a reminder of what was sold — money is applied to the invoice, not to a
            row here.
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <h3 className="border-b border-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-900">
          Receipts
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">Receipt</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Received</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoice.payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-neutral-500">
                    Nothing has been received against this invoice yet.
                  </td>
                </tr>
              ) : (
                invoice.payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs font-medium text-neutral-900">
                        {payment.receiptNo}
                      </span>
                      <p className="mt-0.5">
                        <Badge variant={PAYMENT_STATUS_VARIANT[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={
                          payment.status === "RECEIVED"
                            ? "font-semibold tabular-nums text-neutral-900"
                            : "tabular-nums text-neutral-400 line-through"
                        }
                      >
                        {formatNPR(payment.amount)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">
                      {paymentMethodLabel(payment.method)}
                      {payment.reference && (
                        <p className="text-[11px] text-neutral-500">{payment.reference}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {formatDateTime(payment.receivedAt)}
                      {payment.receivedByName && (
                        <p className="text-[11px] text-neutral-500">{payment.receivedByName}</p>
                      )}
                      {payment.voidReason && (
                        <p className="text-[11px] text-destructive">{payment.voidReason}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/techdarbar/payments/${payment.id}/receipt`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                          title="Receipt PDF"
                          aria-label={`Receipt PDF for ${payment.receiptNo}`}
                        >
                          <FileDown className="size-4" />
                        </a>
                        {payment.status === "RECEIVED" && can.voidPayment && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              setVoidTarget({
                                kind: "receipt",
                                id: payment.id,
                                subject: `${payment.receiptNo} · ${formatNPR(payment.amount)}`,
                              })
                            }
                            title="Void receipt"
                            aria-label={`Void ${payment.receiptNo}`}
                            className="text-destructive/80 hover:text-destructive"
                          >
                            <ShieldOff className="size-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RecordPaymentDialog
        open={recording}
        onOpenChange={setRecording}
        invoice={{
          id: invoice.id,
          number: invoice.number,
          studentName: invoice.studentName,
          balance: invoice.balance,
          nextDueAmount: invoice.nextDueAmount,
        }}
      />
      <VoidDialog target={voidTarget} onOpenChange={setVoidTarget} />
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className={strong ? "mt-0.5 text-sm font-semibold text-neutral-900" : "mt-0.5 text-sm text-neutral-900"}>
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
