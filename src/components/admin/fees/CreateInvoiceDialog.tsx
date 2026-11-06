"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { createInvoiceAction } from "@/server/actions/fees";
import { formatNPR } from "@/lib/format";

type Enrollment = {
  id: string;
  courseTitle: string;
  batchName: string | null;
  feeNPR: number;
};

type Row = { seq: string; amount: string; dueDate: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  enrollments: Enrollment[];
};

/**
 * Drafting a bill (docs 05 §5: invoicing hangs off the enrollment). Choosing a
 * course pre-fills the title and the fee the course card carries, and the schedule
 * must add up to the net amount — that rule is re-proved by the Server Action and
 * again by a CHECK constraint, because a schedule that does not match the bill is
 * how a dues list starts lying.
 */
export function CreateInvoiceDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  enrollments,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [enrollmentId, setEnrollmentId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [gross, setGross] = React.useState("");
  const [discount, setDiscount] = React.useState("0");
  const [discountReason, setDiscountReason] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const grossNumber = Number(gross || 0);
  const discountNumber = Number(discount || 0);
  const net = Number.isFinite(grossNumber - discountNumber) ? grossNumber - discountNumber : 0;
  const scheduled = rows.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);

  const pickEnrollment = (id: string) => {
    setEnrollmentId(id);
    const enrollment = enrollments.find((row) => row.id === id);
    if (!enrollment) return;
    setTitle(`${enrollment.courseTitle}${enrollment.batchName ? ` — ${enrollment.batchName}` : ""}`);
    if (!gross) setGross(String(enrollment.feeNPR));
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        seq: String(current.length + 1),
        amount: "",
        dueDate: current[current.length - 1]?.dueDate ?? "",
      },
    ]);
  };

  const patchRow = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (index: number) => {
    setRows((current) =>
      current
        .filter((_, position) => position !== index)
        .map((row, position) => ({ ...row, seq: String(position + 1) }))
    );
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await createInvoiceAction({
        studentId,
        enrollmentId: enrollmentId || null,
        title: title.trim(),
        grossAmount: gross.trim(),
        discountAmount: discount.trim() || "0",
        discountReason: discountReason.trim(),
        dueDate: dueDate || "",
        note: note.trim(),
        installments: rows.map((row) => ({
          seq: Number(row.seq),
          amount: row.amount.trim(),
          dueDate: row.dueDate,
        })),
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast({ title: "Invoice not saved", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: `Draft ${result.data.number} created`,
        description: "Issue it to make it a bill the student owes.",
        variant: "success",
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        key={open ? studentId : "__closed__"}
        aria-labelledby="create-invoice-title"
        aria-describedby="create-invoice-description"
      >
        <DialogHeader>
          <DialogTitle id="create-invoice-title" className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            New invoice for {studentName}
          </DialogTitle>
          <DialogDescription id="create-invoice-description">
            Saved as a draft with a number assigned. Nothing is owed until it is issued, and a
            discount over the approved share needs an admin to issue it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {enrollments.length > 0 && (
            <div>
              <Label htmlFor="invoice-enrollment" className="mb-1.5 block text-sm font-medium">
                Enrollment <span className="text-neutral-400">(fills the title and fee)</span>
              </Label>
              <Select
                id="invoice-enrollment"
                value={enrollmentId}
                onChange={(event) => pickEnrollment(event.target.value)}
                disabled={submitting}
                options={[
                  { value: "", label: "Not tied to an enrollment" },
                  ...enrollments.map((row) => ({
                    value: row.id,
                    label: `${row.courseTitle}${row.batchName ? ` — ${row.batchName}` : ""} · ${formatNPR(row.feeNPR)}`,
                  })),
                ]}
              />
            </div>
          )}

          <div>
            <Label htmlFor="invoice-title" className="mb-1.5 block text-sm font-medium">
              Title
            </Label>
            <Input
              id="invoice-title"
              value={title}
              maxLength={160}
              placeholder="Web Development — Batch Magh 2083"
              onChange={(event) => setTitle(event.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.title ? true : undefined}
            />
            <ErrorLine messages={fieldErrors.title} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="invoice-gross" className="mb-1.5 block text-sm font-medium">
                Fee (NPR)
              </Label>
              <Input
                id="invoice-gross"
                inputMode="numeric"
                value={gross}
                onChange={(event) => setGross(event.target.value)}
                disabled={submitting}
                aria-invalid={fieldErrors.grossAmount ? true : undefined}
              />
              <ErrorLine messages={fieldErrors.grossAmount} />
            </div>
            <div>
              <Label htmlFor="invoice-discount" className="mb-1.5 block text-sm font-medium">
                Discount (NPR)
              </Label>
              <Input
                id="invoice-discount"
                inputMode="numeric"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                disabled={submitting}
                aria-invalid={fieldErrors.discountAmount ? true : undefined}
              />
              <ErrorLine messages={fieldErrors.discountAmount} />
            </div>
            <div>
              <Label htmlFor="invoice-due" className="mb-1.5 block text-sm font-medium">
                Due date <span className="text-neutral-400">(optional)</span>
              </Label>
              <Input
                id="invoice-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {discountNumber > 0 && (
            <div>
              <Label htmlFor="invoice-discount-reason" className="mb-1.5 block text-sm font-medium">
                Why the discount
              </Label>
              <Input
                id="invoice-discount-reason"
                value={discountReason}
                maxLength={300}
                placeholder="Early payment concession agreed 2082-10-12"
                onChange={(event) => setDiscountReason(event.target.value)}
                disabled={submitting}
              />
            </div>
          )}

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-600">Net payable</span>{" "}
            <span className="font-semibold tabular-nums text-neutral-900">{formatNPR(net)}</span>
            {rows.length > 0 && (
              <span
                className={
                  scheduled === net
                    ? "ml-2 text-xs text-success"
                    : "ml-2 text-xs font-medium text-destructive"
                }
              >
                schedule adds to {formatNPR(scheduled)}
              </span>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-medium">Instalment schedule</Label>
              <Button variant="outline" size="sm" type="button" onClick={addRow} disabled={submitting}>
                <Plus className="size-4" />
                Add row
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No schedule: the whole net amount is due on the invoice date.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((row, index) => (
                  <div key={row.seq} className="flex items-end gap-2">
                    <span className="w-8 pb-2.5 text-xs font-semibold text-neutral-500 tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <Label htmlFor={`row-amount-${index}`} className="sr-only">
                        Instalment amount
                      </Label>
                      <Input
                        id={`row-amount-${index}`}
                        inputMode="numeric"
                        placeholder="Amount"
                        value={row.amount}
                        onChange={(event) => patchRow(index, { amount: event.target.value })}
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`row-date-${index}`} className="sr-only">
                        Instalment due date
                      </Label>
                      <Input
                        id={`row-date-${index}`}
                        type="date"
                        value={row.dueDate}
                        onChange={(event) => patchRow(index, { dueDate: event.target.value })}
                        disabled={submitting}
                      />
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={submitting}
                      aria-label={`Remove instalment ${index + 1}`}
                      className="text-destructive/80 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <ErrorLine messages={fieldErrors.installments} />
          </div>

          <div>
            <Label htmlFor="invoice-note" className="mb-1.5 block text-sm font-medium">
              Note <span className="text-neutral-400">(optional)</span>
            </Label>
            <Textarea
              id="invoice-note"
              rows={2}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorLine({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{messages[0]}</p>;
}
