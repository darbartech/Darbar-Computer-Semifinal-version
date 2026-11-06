"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, FilterX, IndianRupee, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { issueInvoiceAction } from "@/server/actions/fees";
import { AGING_OPTIONS, PAYMENT_METHOD_OPTIONS, FEE_TABS, type FeeTab } from "@/lib/validators/fees";
import { formatNPR } from "@/lib/format";
import type {
  DueRow,
  DuesSummary,
  FeeListResult,
  InvoiceRow,
  PaymentRow,
} from "@/server/types/fees";
import { DuesTable } from "./DuesTable";
import { InvoicesTable } from "./InvoicesTable";
import { PaymentsTable } from "./PaymentsTable";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { VoidDialog, type VoidTarget } from "./VoidDialog";

export type FeesFilterState = {
  q: string;
  aging: string;
  status: string;
  method: string;
  courseId: string;
  batchId: string;
  day: string;
};

type Props = {
  tab: FeeTab;
  dues?: FeeListResult<DueRow> & { summary: DuesSummary };
  invoices?: FeeListResult<InvoiceRow>;
  payments?: FeeListResult<PaymentRow>;
  filters: FeesFilterState;
  courses: { id: string; title: string }[];
  batches: { id: string; name: string; courseTitle: string }[];
  can: { issue: boolean; voidInvoice: boolean; record: boolean; voidPayment: boolean };
};

const PAGE_PATH = "/techdarbar/fees";

const TAB_META: Record<FeeTab, { label: string; icon: typeof IndianRupee }> = {
  dues: { label: "Dues", icon: Wallet },
  invoices: { label: "Invoices", icon: BookOpen },
  payments: { label: "Payments", icon: IndianRupee },
};

/**
 * The three tabs of `/techdarbar/fees` (docs 05 §5). Filters live in the URL, so a
 * filtered Dues view can be handed to someone on the phone and a page reload keeps
 * the accountant's aging chip.
 */
export function FeesManager(props: Props) {
  const { tab, filters, courses, batches, can, dues, invoices, payments } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [recordTarget, setRecordTarget] = React.useState<RecordPaymentTarget | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<VoidTarget | null>(null);
  const [pendingIssueId, setPendingIssueId] = React.useState<string | null>(null);

  const push = React.useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${PAGE_PATH}?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const applyFilters = (patch: Partial<FeesFilterState>) => {
    const merged = { ...filters, ...patch };
    push({ ...merged, page: undefined });
  };

  const setPage = (page: number) => push({ page: page > 1 ? String(page) : undefined });

  const onIssue = async (row: InvoiceRow) => {
    setPendingIssueId(row.id);
    try {
      const result = await issueInvoiceAction({ id: row.id });
      if (!result.ok) {
        toast({ title: "Could not issue", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: `${row.number} issued`,
        description: "The student now owes this amount. Void and re-create to correct it.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setPendingIssueId(null);
    }
  };

  const recordTargetFor = (row: InvoiceRow | DueRow): RecordPaymentTarget => ({
    id: row.id,
    number: row.number,
    studentName: row.studentName,
    balance: row.balance,
    nextDueAmount: "nextDueAmount" in row ? row.nextDueAmount ?? null : null,
  });

  const list = dues ?? invoices ?? payments;
  const total = list?.total ?? 0;
  const page = list?.page ?? 1;
  const pageCount = list?.pageCount ?? 1;
  const pageStart = total ? (page - 1) * 25 + 1 : 0;
  const pageEnd = Math.min(page * 25, total);
  const hasFilters = Object.entries(filters).some(([key, value]) => value && key !== "aging");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-100 p-1 text-neutral-600 sm:w-auto">
          {FEE_TABS.map((value) => {
            const Icon = TAB_META[value].icon;
            const active = value === tab;
            return (
              <Link
                key={value}
                href={`${PAGE_PATH}?tab=${value}${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:text-neutral-900"
                }
              >
                <Icon className="size-4" />
                {TAB_META[value].label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/techdarbar/fees/day-book"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <CalendarDays className="size-4" />
          Day book
        </Link>
      </div>

      {dues && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile label="Outstanding" value={formatNPR(dues.summary.outstanding)} />
          <SummaryTile
            label="Overdue bills"
            value={`${dues.summary.overdueCount} · ${formatNPR(dues.summary.overdueAmount)}`}
          />
          <SummaryTile label="Open invoices" value={String(dues.total)} />
        </div>
      )}

      {dues && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1.5">
          {AGING_OPTIONS.map((option) => {
            const active = filters.aging === option.value;
            const count =
              option.value === "all"
                ? Object.values(dues.summary.buckets).reduce((sum, value) => sum + value, 0)
                : dues.summary.buckets[option.value as keyof typeof dues.summary.buckets] ?? 0;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => applyFilters({ aging: option.value })}
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }
              >
                {option.label}
                <span
                  className={
                    active
                      ? "rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                      : "rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-500"
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("q");
              applyFilters({ q: typeof value === "string" ? value : "" });
            }}
          >
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="fee-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="fee-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Invoice, receipt, student name or code"
                className="pl-10 pr-16"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center rounded-md bg-neutral-100 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
              >
                Search
              </button>
            </div>
          </form>

          {tab === "invoices" && (
            <FilterField
              id="fee-status"
              label="Status"
              value={filters.status}
              onChange={(value) => applyFilters({ status: value })}
              options={[
                { value: "", label: "Any status" },
                { value: "DRAFT", label: "Draft" },
                { value: "ISSUED", label: "Issued" },
                { value: "PARTIAL", label: "Partly paid" },
                { value: "PAID", label: "Paid" },
                { value: "VOID", label: "Void" },
              ]}
            />
          )}
          {tab === "payments" && (
            <>
              <FilterField
                id="fee-method"
                label="Method"
                value={filters.method}
                onChange={(value) => applyFilters({ method: value })}
                options={[
                  { value: "", label: "Any method" },
                  ...PAYMENT_METHOD_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  })),
                ]}
              />
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="fee-day">
                  Day
                </label>
                <Input
                  id="fee-day"
                  type="date"
                  value={filters.day}
                  onChange={(event) => applyFilters({ day: event.target.value })}
                  className="w-full lg:w-44"
                />
              </div>
            </>
          )}

          <FilterField
            id="fee-course"
            label="Course"
            value={filters.courseId}
            onChange={(value) => applyFilters({ courseId: value })}
            options={[
              { value: "", label: "All courses" },
              ...courses.map((course) => ({ value: course.id, label: course.title })),
            ]}
          />
          <FilterField
            id="fee-batch"
            label="Batch"
            value={filters.batchId}
            onChange={(value) => applyFilters({ batchId: value })}
            options={[
              { value: "", label: "All batches" },
              ...batches.map((batch) => ({
                value: batch.id,
                label: `${batch.name} — ${batch.courseTitle}`,
              })),
            ]}
          />

          {hasFilters && (
            <Button
              variant="outline"
              type="button"
              onClick={() =>
                applyFilters({ q: "", status: "", method: "", courseId: "", batchId: "", day: "" })
              }
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {total === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-neutral-500">
            {tab === "dues"
              ? "Nothing is outstanding. Every issued invoice has been paid."
              : "No records match these filters."}
          </p>
        ) : tab === "dues" && dues ? (
          <DuesTable
            rows={dues.rows}
            canRecord={can.record}
            onRecord={(row) => setRecordTarget(recordTargetFor(row))}
          />
        ) : tab === "invoices" && invoices ? (
          <InvoicesTable
            rows={invoices.rows}
            canIssue={can.issue}
            canVoid={can.voidInvoice}
            canRecord={can.record}
            pendingIssueId={pendingIssueId}
            onIssue={onIssue}
            onRecord={(row) => setRecordTarget(recordTargetFor(row))}
            onVoid={(row) =>
              setVoidTarget({
                kind: "invoice",
                id: row.id,
                subject: `${row.number} · ${row.studentName}`,
              })
            }
          />
        ) : tab === "payments" && payments ? (
          <PaymentsTable
            rows={payments.rows}
            canVoid={can.voidPayment}
            onVoid={(row) =>
              setVoidTarget({
                kind: "receipt",
                id: row.id,
                subject: `${row.receiptNo} · ${formatNPR(row.amount)} from ${row.studentName}`,
              })
            }
          />
        ) : null}

        {total > 0 && (
          <div className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-neutral-500">
              Showing {pageStart}–{pageEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="min-w-[3rem] text-center text-sm text-neutral-600">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {recordTarget && (
        <RecordPaymentDialog
          open
          onOpenChange={(open) => (open ? undefined : setRecordTarget(null))}
          invoice={recordTarget}
        />
      )}
      <VoidDialog target={voidTarget} onOpenChange={setVoidTarget} />
    </div>
  );
}

type RecordPaymentTarget = {
  id: string;
  number: string;
  studentName: string;
  balance: number;
  nextDueAmount: number | null;
};

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

function FilterField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="lg:w-48">
      <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor={id}>
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={options}
      />
    </div>
  );
}
