"use client";
import Link from "next/link";
import { BadgeIndianRupee, Eye, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { formatNPR } from "@/lib/format";
import type { InvoiceRow } from "@/server/types/fees";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  dateOrDash
} from "./status";

type Props = {
  rows: InvoiceRow[];
  canIssue: boolean;
  canVoid: boolean;
  canRecord: boolean;
  onIssue: (row: InvoiceRow) => void;
  onVoid: (row: InvoiceRow) => void;
  onRecord: (row: InvoiceRow) => void;
  pendingIssueId: string | null;
};

/**
 * Every invoice, drafts included — this is the tab where a mistake is still
 * editable. An issued bill is immutable, so the only actions left on it are
 * payment, receipt and void (docs 05 §2).
 */
export function InvoicesTable({
  rows,
  canIssue,
  canVoid,
  canRecord,
  onIssue,
  onVoid,
  onRecord,
  pendingIssueId,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Net</th>
            <th className="px-4 py-3 text-right">Paid</th>
            <th className="px-4 py-3 text-right">Balance</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const payable = row.status === "ISSUED" || row.status === "PARTIAL";
            return (
              <tr key={row.id} className="hover:bg-neutral-50/70">
                <td className="px-4 py-3">
                  <Link
                    href={`/techdarbar/fees/${row.id}`}
                    className="font-mono text-xs font-medium text-neutral-900 hover:text-primary hover:underline"
                  >
                    {row.number}
                  </Link>
                  <p className="max-w-[16rem] truncate text-xs text-neutral-500">{row.title}</p>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/techdarbar/students/${row.studentId}`}
                    className="text-neutral-800 hover:text-primary hover:underline"
                  >
                    {row.studentName}
                  </Link>
                  <p className="font-mono text-[11px] text-neutral-500">{row.studentCode}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={INVOICE_STATUS_VARIANT[row.status] ?? "outline"}>
                    {INVOICE_STATUS_LABELS[row.status]}
                  </Badge>
                  {row.discountAmount > 0 && (
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {formatNPR(row.discountAmount)} off
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-800">
                  {formatNPR(row.netAmount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {formatNPR(row.paidAmount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={
                      row.balance > 0
                        ? "font-semibold tabular-nums text-neutral-900"
                        : "tabular-nums text-neutral-400"
                    }
                  >
                    {formatNPR(row.balance)}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">{dateOrDash(row.dueDate)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {row.status === "DRAFT" && canIssue && (
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={pendingIssueId === row.id}
                        onClick={() => onIssue(row)}
                        title="Turn this draft into a bill"
                      >
                        <ShieldCheck className="size-4" />
                        Issue
                      </Button>
                    )}
                    {payable && canRecord && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="button"
                        onClick={() => onRecord(row)}
                        title="Record payment"
                        aria-label={`Record payment for ${row.number}`}
                      >
                        <BadgeIndianRupee className="size-4" />
                      </Button>
                    )}
                    <Link
                      href={`/techdarbar/fees/${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      title="Open invoice"
                      aria-label={`Open ${row.number}`}
                    >
                      <Eye className="size-4" />
                    </Link>
                    {row.status !== "VOID" && canVoid && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="button"
                        onClick={() => onVoid(row)}
                        title="Void invoice"
                        aria-label={`Void ${row.number}`}
                        className="text-destructive/80 hover:text-destructive"
                      >
                        <ShieldOff className="size-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
