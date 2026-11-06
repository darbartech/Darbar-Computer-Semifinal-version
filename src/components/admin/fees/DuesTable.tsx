"use client";
import Link from "next/link";
import { BadgeIndianRupee } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { formatNPR } from "@/lib/format";
import type { DueRow } from "@/server/types/fees";
import {
  AGING_SHORT_LABELS,
  AGING_VARIANT,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  dateOrDash,
} from "./status";

type Props = {
  rows: DueRow[];
  canRecord: boolean;
  onRecord: (row: DueRow) => void;
};

/**
 * The Dues list (docs 05 §5): overdue first, oldest debt on top. The balance is
 * computed from the ledger, so the figure here is what the record-payment dialog
 * will be checked against a second later.
 */
export function DuesTable({ rows, canRecord, onRecord }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Course / batch</th>
            <th className="px-4 py-3 text-right">Balance</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3">Aging</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-neutral-50/70">
              <td className="px-4 py-3">
                <Link
                  href={`/techdarbar/students/${row.studentId}`}
                  className="font-medium text-neutral-900 hover:text-primary hover:underline"
                >
                  {row.studentName}
                </Link>
                <p className="font-mono text-[11px] text-neutral-500">{row.studentCode}</p>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/techdarbar/fees/${row.id}`}
                  className="font-mono text-xs text-neutral-800 hover:text-primary hover:underline"
                >
                  {row.number}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                  <Badge variant={INVOICE_STATUS_VARIANT[row.status] ?? "outline"}>
                    {INVOICE_STATUS_LABELS[row.status]}
                  </Badge>
                  {row.paidAmount > 0 ? `${formatNPR(row.paidAmount)} paid` : "nothing paid"}
                </p>
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {row.courseTitle ?? row.title}
                {row.batchName && (
                  <p className="text-xs text-neutral-500">{row.batchName}</p>
                )}
                {row.counselorName && (
                  <p className="text-xs text-neutral-500">with {row.counselorName}</p>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-semibold tabular-nums text-neutral-900">
                  {formatNPR(row.balance)}
                </span>
                {row.nextDueAmount !== null && row.nextDueAmount < row.balance && (
                  <p className="text-xs text-neutral-500 tabular-nums">
                    next {formatNPR(row.nextDueAmount)}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-600">{dateOrDash(row.dueDate)}</td>
              <td className="px-4 py-3">
                <Badge variant={AGING_VARIANT[row.aging]}>
                  {AGING_SHORT_LABELS[row.aging]}
                  {row.daysOverdue && row.daysOverdue > 0 ? ` · ${row.daysOverdue}d` : ""}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                {canRecord ? (
                  <Button size="sm" variant="outline" type="button" onClick={() => onRecord(row)}>
                    <BadgeIndianRupee className="size-4" />
                    Payment
                  </Button>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
