"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeIndianRupee, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { recordPaymentAction } from "@/server/actions/fees";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/validators/fees";
import { formatNPR, kathmanduDayKey } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    number: string;
    studentName: string;
    balance: number;
    /** From the instalment schedule, so the clerk is not doing arithmetic (docs 05 §5). */
    nextDueAmount: number | null;
  };
};

/**
 * Taking money over the counter. The amount arrives as text and is re-checked
 * server-side against the live balance — this dialog is a convenience, not the
 * authority: a second clerk may have paid part of this invoice a moment ago.
 */
export function RecordPaymentDialog({ open, onOpenChange, invoice }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const suggested = invoice.nextDueAmount ?? invoice.balance;

  const [amount, setAmount] = React.useState(() => String(suggested));
  const [method, setMethod] = React.useState<string>("CASH");
  const [reference, setReference] = React.useState("");
  const [day, setDay] = React.useState(() => kathmanduDayKey());
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = React.useState(false);
  /**
   * One key per opening of this dialog, not one per click (fix guide §1): the second
   * send of a double-click, and the resend after a response was lost, are the same
   * attempt as far as the ledger is concerned, and get the first receipt back.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const remountKey = open ? invoice.id : "__closed__";

  /** Every change of the open state ends the attempt, so the next click mints afresh. */
  const setOpen = (next: boolean) => {
    idempotencyKey.current = null;
    onOpenChange(next);
  };

  const onSubmit = async () => {
    idempotencyKey.current ??= crypto.randomUUID();
    setSubmitting(true);
    try {
      const result = await recordPaymentAction({
        invoiceId: invoice.id,
        amount: amount.trim(),
        method,
        reference: reference.trim(),
        receivedAt: day,
        idempotencyKey: idempotencyKey.current,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast({
          title: "Payment not recorded",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: `Receipt ${result.data.receiptNo}`,
        description:
          result.data.balance > 0
            ? `${formatNPR(invoice.balance - result.data.balance)} received · ${formatNPR(result.data.balance)} still owed`
            : `${formatNPR(invoice.balance)} received — invoice paid in full.`,
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-lg"
        key={remountKey}
        aria-labelledby="record-payment-title"
        aria-describedby="record-payment-description"
      >
        <DialogHeader>
          <DialogTitle id="record-payment-title" className="flex items-center gap-2">
            <BadgeIndianRupee className="size-5 text-primary" />
            Record payment
          </DialogTitle>
          <DialogDescription id="record-payment-description">
            {invoice.studentName} · {invoice.number} — balance {formatNPR(invoice.balance)}.
            A receipt number is generated on save and the invoice status follows the money.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="payment-amount" className="mb-1.5 block text-sm font-medium">
              Amount (NPR)
            </Label>
            <Input
              id="payment-amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.amount ? true : undefined}
            />
            {fieldErrors.amount?.[0] ? (
              <p className="mt-1 text-xs font-medium text-destructive">{fieldErrors.amount[0]}</p>
            ) : null}
            {suggested !== invoice.balance && (
              <button
                type="button"
                onClick={() => setAmount(String(invoice.balance))}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                Next instalment is {formatNPR(suggested)} — pay the full {formatNPR(invoice.balance)}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="payment-method" className="mb-1.5 block text-sm font-medium">
                Method
              </Label>
              <Select
                id="payment-method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                disabled={submitting}
                options={PAYMENT_METHOD_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="payment-day" className="mb-1.5 block text-sm font-medium">
                Received on
              </Label>
              <Input
                id="payment-day"
                type="date"
                value={day}
                max={kathmanduDayKey()}
                onChange={(event) => setDay(event.target.value)}
                disabled={submitting}
                aria-invalid={fieldErrors.receivedAt ? true : undefined}
              />
              {fieldErrors.receivedAt?.[0] ? (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {fieldErrors.receivedAt[0]}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="payment-reference" className="mb-1.5 block text-sm font-medium">
              Reference{" "}
              <span className="text-neutral-400">
                {method === "CASH" ? "(optional)" : "(needed for a slip)"}
              </span>
            </Label>
            <Input
              id="payment-reference"
              value={reference}
              placeholder="Bank slip, cheque or gateway number"
              maxLength={120}
              onChange={(event) => setReference(event.target.value)}
              disabled={submitting}
              aria-required={method === "CASH" ? undefined : true}
              aria-invalid={fieldErrors.reference ? true : undefined}
            />
            {fieldErrors.reference?.[0] ? (
              <p className="mt-1 text-xs font-medium text-destructive">
                {fieldErrors.reference[0]}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
