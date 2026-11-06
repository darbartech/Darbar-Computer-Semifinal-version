"use client";
import Link from "next/link";
import { FileDown, ShieldOff } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNPR } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/validators/fees";
import type { PaymentRow } from "@/server/types/fees";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANT,
} from "./status";

type Props = {
  rows: PaymentRow[];
  canVoid: boolean;
  onVoid: (row: PaymentRow) => void;
};

/**
 * The receipts ledger. A voided row stays visible with its original number: the
 * money record is what makes an audit possible, so it is annotated, never removed
 * (docs 05 §2).
 */
export function PaymentsTable({ rows, canVoid, onVoid }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-4 py-3">Receipt</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Received</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-neutral-50/70">
              <td className="px-4 py-3">
                <Link
                  href={`/techdarbar/fees/${row.invoiceId}`}
                  className="font-mono text-xs font-medium text-neutral-900 hover:text-primary hover:underline"
                >
                  {row.receiptNo}
                </Link>
                {row.status === "VOIDED" && (
                  <p className="mt-0.5 text-[11px] text-destructive">
                    voided · {row.voidReason ?? "no reason given"}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-800">
                {row.studentName}
                <p className="font-mono text-[11px] text-neutral-500">{row.studentCode}</p>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/techdarbar/fees/${row.invoiceId}`}
                  className="font-mono text-xs text-neutral-700 hover:text-primary hover:underline"
                >
                  {row.invoiceNumber}
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={
                    row.status === "RECEIVED"
                      ? "font-semibold tabular-nums text-neutral-900"
                      : "tabular-nums text-neutral-400 line-through"
                  }
                >
                  {formatNPR(row.amount)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-neutral-700">{paymentMethodLabel(row.method)}</span>
                {row.reference && (
                  <p className="text-[11px] text-neutral-500">{row.reference}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant={PAYMENT_STATUS_VARIANT[row.status]}>
                  {PAYMENT_STATUS_LABELS[row.status]}
                </Badge>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {formatDateTime(row.receivedAt)}
                  {row.receivedByName ? ` · ${row.receivedByName}` : ""}
                </p>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <a
                    href={`/api/techdarbar/payments/${row.id}/receipt`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    title="Receipt PDF"
                    aria-label={`Receipt PDF for ${row.receiptNo}`}
                  >
                    <FileDown className="size-4" />
                  </a>
                  {row.status === "RECEIVED" && canVoid && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      type="button"
                      onClick={() => onVoid(row)}
                      title="Void receipt"
                      aria-label={`Void ${row.receiptNo}`}
                      className="text-destructive/80 hover:text-destructive"
                    >
                      <ShieldOff className="size-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
