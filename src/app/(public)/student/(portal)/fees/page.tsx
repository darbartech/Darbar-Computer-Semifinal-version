import { NOINDEX_METADATA } from "@/lib/seo";
import { requireStudentProfile } from "@/server/student-session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/common/Badge";
import { Wallet, Download } from "lucide-react";
import Link from "next/link";
import { getStudentFeeSummaries } from "@/server/dal/fees";
import { paymentMethodLabel } from "@/lib/validators/fees";
import { formatNPR } from "@/lib/format";
import { fmtDate } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/components/admin/fees/status";

export const metadata = {
  title: "My fees",
  robots: NOINDEX_METADATA,
};

/**
 * "My fees" (docs 05 §5). Drafts never appear here — a bill the office has not
 * issued is not a debt the student should see. Receipts download from the student
 * route, which re-checks that the receipt belongs to this account.
 */
export default async function StudentFeesPage() {
  const { profile } = await requireStudentProfile();
  const invoices = await getStudentFeeSummaries(profile.id);

  const payable = invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIAL");
  const outstanding = payable.reduce((sum, i) => sum + i.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">My fees</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Bills issued to you and the receipts the office has given back.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Wallet className="size-4" />
          {outstanding > 0 ? (
            <span className="font-semibold text-neutral-900">{formatNPR(outstanding)} outstanding</span>
          ) : (
            <span>Nothing outstanding</span>
          )}
        </div>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Wallet className="mx-auto size-10 text-neutral-300" />
            <p className="mt-4 font-medium text-neutral-900">No fees billed yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
              Once the office issues your course fee it appears here, with a receipt for every
              payment you make at the counter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                      {invoice.title}
                      <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "outline"}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">{invoice.number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-neutral-900">
                      {formatNPR(invoice.balance)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatNPR(invoice.paidAmount)} paid of {formatNPR(invoice.netAmount)}
                    </p>
                  </div>
                </div>

                {invoice.nextDueAmount !== null && (
                  <p className="mt-2 text-sm text-neutral-600">
                    Next instalment {formatNPR(invoice.nextDueAmount)}
                    {invoice.nextDueDate ? ` due ${fmtDate(invoice.nextDueDate)}` : " due"}
                    {" — pay at the office; the receipt is issued the same day."}
                  </p>
                )}

                {invoice.receipts.length > 0 && (
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Receipts
                    </h3>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {invoice.receipts.map((receipt) => (
                        <li key={receipt.id} className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-neutral-700">
                            <span className="font-mono text-xs text-neutral-500">
                              {receipt.receiptNo}
                            </span>
                            <span className="truncate">{paymentMethodLabel(receipt.method)}</span>
                            {receipt.status === "VOIDED" && (
                              <Badge variant="destructive">voided</Badge>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span
                              className={
                                receipt.status === "VOIDED"
                                  ? "tabular-nums text-neutral-400 line-through"
                                  : "tabular-nums text-neutral-900"
                              }
                            >
                              {formatNPR(receipt.amount)}
                            </span>
                            <Link
                              href={`/api/student/payments/${receipt.id}/receipt`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <Download className="size-3.5" />
                              PDF
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
