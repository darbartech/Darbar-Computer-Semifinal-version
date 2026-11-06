import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { getDayBook } from "@/server/dal/fees";
import { DayCloseControls } from "@/components/admin/fees/DayCloseControls";
import { feeFilterSchema, paymentMethodLabel } from "@/lib/validators/fees";
import { dayKeyLabel, formatDateTime, formatNPR } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VARIANT } from "@/components/admin/fees/status";

export const metadata: Metadata = {
  title: "Day book",
  robots: { index: false, follow: false },
};

/**
 * The cash book for one campus day (docs 05 §5): what came in, how it came in and
 * who took it. A voided receipt stays listed — the day it was rung up is part of the
 * record — but it is excluded from the totals, because that money was never real.
 */
export default async function AdminDayBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("fee.read");

  const sp = await searchParams;
  const parsed = feeFilterSchema.safeParse(
    Object.fromEntries(
      Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
    )
  );
  const day = parsed.success ? parsed.data.day : undefined;
  const book = await getDayBook(day);

  const shift = (offset: number) => {
    const base = new Date(`${book.totals.day}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Fees", href: "/techdarbar/fees" },
          { label: "Day book" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <CalendarDays className="size-6 text-primary" />
            Day book
          </h1>
          <p className="text-sm text-neutral-600">
            {dayKeyLabel(book.totals.day)} — {book.totals.count} receipt
            {book.totals.count === 1 ? "" : "s"} totalling {formatNPR(book.totals.total)}.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <form method="get" className="flex items-end gap-2">
            <Input
              type="date"
              name="day"
              defaultValue={book.totals.day}
              aria-label="Day"
              className="w-44"
            />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Open
            </button>
          </form>
          <Link
            href={`/techdarbar/fees/day-book?day=${shift(-1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={`/techdarbar/fees/day-book?day=${shift(1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </Link>
          <Link
            href="/techdarbar/fees/day-book"
            className={buttonVariants({ variant: "ghost" })}
          >
            Today
          </Link>
        </div>
      </div>

      <DayCloseControls
        day={book.totals.day}
        cashSystem={book.totals.cash}
        closure={book.closure}
        canClose={can(user.role, "fee.closeDay")}
        canReopen={can(user.role, "fee.reopenDay")}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="By method">
          {book.totals.byMethod.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing collected on this day.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {book.totals.byMethod.map((row) => (
                <li key={row.method} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-neutral-700">
                    {row.label}
                    <span className="ml-1 text-xs text-neutral-500">({row.count})</span>
                  </span>
                  <span className="font-semibold tabular-nums text-neutral-900">
                    {formatNPR(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Who received it">
          {book.totals.byReceiver.length === 0 ? (
            <p className="text-sm text-neutral-500">No collections to attribute.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {book.totals.byReceiver.map((row) => (
                <li key={row.name} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-neutral-700">
                    {row.name}
                    <span className="ml-1 text-xs text-neutral-500">({row.count})</span>
                  </span>
                  <span className="font-semibold tabular-nums text-neutral-900">
                    {formatNPR(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {book.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500">
                    No receipts on this day.
                  </td>
                </tr>
              ) : (
                book.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/techdarbar/fees/${row.invoiceId}`}
                        className="font-mono text-xs font-medium text-neutral-900 hover:text-primary hover:underline"
                      >
                        {row.receiptNo}
                      </Link>
                      {row.status === "VOIDED" && (
                        <p className="mt-0.5">
                          <Badge variant={PAYMENT_STATUS_VARIANT.VOIDED}>
                            {PAYMENT_STATUS_LABELS.VOIDED}
                          </Badge>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-800">
                      {row.studentName}
                      <p className="font-mono text-[11px] text-neutral-500">{row.studentCode}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                      {row.invoiceNumber}
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
                    <td className="px-4 py-3 text-neutral-700">
                      {paymentMethodLabel(row.method)}
                      {row.reference && (
                        <p className="text-[11px] text-neutral-500">{row.reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatDateTime(row.receivedAt)}
                      {row.receivedByName && (
                        <p className="text-[11px] text-neutral-500">{row.receivedByName}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}
