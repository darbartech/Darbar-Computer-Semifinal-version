"use client";
import * as React from "react";
import Link from "next/link";
import { BadgeIndianRupee, FilePlus2 } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNPR } from "@/lib/format";
import type { StudentInvoiceSummary } from "@/server/types/fees";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT, dateOrDash } from "./status";

type Enrollment = {
  id: string;
  courseTitle: string;
  batchName: string | null;
  feeNPR: number;
};

type Props = {
  studentId: string;
  studentName: string;
  /** Drafts are included for staff — an accountant must see what still needs issuing. */
  invoices: StudentInvoiceSummary[];
  enrollments: Enrollment[];
  can: { create: boolean; record: boolean };
};

const PAYABLE = new Set(["ISSUED", "PARTIAL"]);

/**
 * Fees for one student (docs 05 §5 — billing hangs off the enrollment, so the
 * student screen is where a bill starts). Money owed is read from the same ledger
 * the Dues tab uses, so the figure here and the figure the payment is checked
 * against cannot disagree.
 */
export function StudentFeesCard({ studentId, studentName, invoices, enrollments, can }: Props) {
  const [creating, setCreating] = React.useState(false);
  const [payFor, setPayFor] = React.useState<StudentInvoiceSummary | null>(null);

  const billed = invoices
    .filter((invoice) => invoice.status !== "VOID")
    .reduce((sum, invoice) => sum + invoice.netAmount, 0);
  const received = invoices
    .filter((invoice) => invoice.status !== "VOID")
    .reduce((sum, invoice) => sum + invoice.paidAmount, 0);
  const outstanding = billed - received;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Fees</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {formatNPR(billed)} billed · {formatNPR(received)} received
              {outstanding > 0 && (
                <span className="font-medium text-destructive"> · {formatNPR(outstanding)} outstanding</span>
              )}
            </p>
          </div>
          {can.create && (
            <Button size="sm" type="button" onClick={() => setCreating(true)}>
              <FilePlus2 className="size-4" />
              New invoice
            </Button>
          )}
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            Nothing billed yet. {can.create ? "Draft an invoice from one of this student's enrolled courses." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Due</th>
                  {can.record && <th className="px-3 py-2.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-neutral-50/70">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/techdarbar/fees/${invoice.id}`}
                        className="font-mono text-xs text-neutral-800 hover:text-primary hover:underline"
                      >
                        {invoice.number}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                        <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "outline"}>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                        {invoice.title}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">
                      {formatNPR(invoice.netAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">
                      {formatNPR(invoice.paidAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-semibold tabular-nums text-neutral-900">
                        {formatNPR(invoice.balance)}
                      </span>
                      {invoice.nextDueAmount !== null && invoice.nextDueAmount < invoice.balance && (
                        <p className="text-xs text-neutral-500 tabular-nums">
                          next {formatNPR(invoice.nextDueAmount)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">{dateOrDash(invoice.dueDate)}</td>
                    {can.record && (
                      <td className="px-3 py-2.5 text-right">
                        {PAYABLE.has(invoice.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => setPayFor(invoice)}
                          >
                            <BadgeIndianRupee className="size-4" />
                            Payment
                          </Button>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoices.some((invoice) => invoice.status === "DRAFT") && (
          <p className="mt-3 text-xs text-neutral-500">
            Draft bills are internal: the student only sees them once issued.
          </p>
        )}

        {creating && (
          <CreateInvoiceDialog
            open
            onOpenChange={setCreating}
            studentId={studentId}
            studentName={studentName}
            enrollments={enrollments}
          />
        )}
        {payFor && (
          <RecordPaymentDialog
            open
            onOpenChange={(open) => {
              if (!open) setPayFor(null);
            }}
            invoice={{
              id: payFor.id,
              number: payFor.number,
              studentName,
              balance: payFor.balance,
              nextDueAmount: payFor.nextDueAmount,
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
