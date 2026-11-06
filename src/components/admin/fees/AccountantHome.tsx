import Link from "next/link";
import { ArrowRight, BadgeIndianRupee, BookOpenText, Wallet } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AGING_OPTIONS,
  DUE_AGING_BUCKETS,
  feeFilterSchema,
  type DueAgingBucket,
} from "@/lib/validators/fees";
import { getDayBook, listDues } from "@/server/dal/fees";
import { formatNPR } from "@/lib/format";
import { AGING_SHORT_LABELS, AGING_VARIANT, dateOrDash } from "./status";

/**
 * The accountant's landing (docs 08 §2): overdue by aging, today's collection,
 * day book. Numbers come from the same DAL reads the Dues tab uses, so the
 * dashboard can never report a total the ledger disagrees with.
 */
export async function AccountantHome({ name }: { name: string }) {
  const [dues, book] = await Promise.all([
    listDues(feeFilterSchema.parse({})),
    getDayBook(),
  ]);

  const summary = dues.summary;
  const urgent = dues.rows.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Accounts
        </h1>
        <p className="text-sm text-neutral-600">
          {name}, here is what the office owes you today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label="Collected today"
          value={formatNPR(book.totals.total)}
          hint={`${book.totals.count} receipt${book.totals.count === 1 ? "" : "s"} · ${book.totals.day}`}
          icon={<BadgeIndianRupee className="size-5" />}
          tone="success"
        />
        <Tile
          label="Still outstanding"
          value={formatNPR(summary.outstanding)}
          hint={`${dues.total} unpaid invoice${dues.total === 1 ? "" : "s"}`}
          icon={<Wallet className="size-5" />}
          tone="neutral"
        />
        <Tile
          label="Overdue"
          value={formatNPR(summary.overdueAmount)}
          hint={`${summary.overdueCount} bill${summary.overdueCount === 1 ? "" : "s"} past their date`}
          icon={<ArrowRight className="size-5" />}
          tone="destructive"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overdue by age</CardTitle>
          <CardDescription>Open a band to work through that list.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {DUE_AGING_BUCKETS.map((bucket: DueAgingBucket) => {
            const option = AGING_OPTIONS.find((item) => item.value === bucket);
            return (
              <Link
                key={bucket}
                href={`/techdarbar/fees?tab=dues&aging=${bucket}`}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
              >
                <span>{option?.label ?? bucket}</span>
                <Badge variant={AGING_VARIANT[bucket]}>{summary.buckets[bucket] ?? 0}</Badge>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Most urgent bills</CardTitle>
            <CardDescription>
              Oldest debt first — the same order the Dues list uses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {urgent.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
                Nothing outstanding. Every issued invoice is paid.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {urgent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/techdarbar/students/${row.studentId}`}
                        className="truncate font-medium text-neutral-900 hover:text-primary hover:underline"
                      >
                        {row.studentName}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                        <Link
                          href={`/techdarbar/fees/${row.id}`}
                          className="font-mono hover:text-primary hover:underline"
                        >
                          {row.number}
                        </Link>
                        <span className="truncate">{row.courseTitle ?? row.title}</span>
                        <Badge variant={AGING_VARIANT[row.aging]}>
                          {AGING_SHORT_LABELS[row.aging]}
                          {row.daysOverdue && row.daysOverdue > 0 ? ` · ${row.daysOverdue}d` : ""}
                        </Badge>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-neutral-900">
                        {formatNPR(row.balance)}
                      </p>
                      <p className="text-xs text-neutral-500">due {dateOrDash(row.nextDueDate ?? row.dueDate)}</p>
                    </div>
                    <Link href={`/techdarbar/fees/${row.id}`} className="shrink-0">
                      <Button size="sm" variant="outline" type="button">
                        <BadgeIndianRupee className="size-4" />
                        Record
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Link href="/techdarbar/fees?tab=dues" className="w-full">
              <Button variant="ghost" className="w-full group">
                Open the full dues list
                <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today&rsquo;s collection</CardTitle>
            <CardDescription>Counter takings for {book.totals.day}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {book.totals.count === 0 ? (
              <p className="text-neutral-500">No payments recorded yet today.</p>
            ) : (
              <>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    By method
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {book.totals.byMethod.map((line) => (
                      <li key={line.method} className="flex justify-between gap-2">
                        <span className="text-neutral-700">{line.label}</span>
                        <span className="tabular-nums text-neutral-900">
                          {formatNPR(line.amount)}
                          <span className="ml-1 text-xs text-neutral-500">×{line.count}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Who received it
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {book.totals.byReceiver.map((line) => (
                      <li key={line.name} className="flex justify-between gap-2">
                        <span className="truncate text-neutral-700">{line.name}</span>
                        <span className="shrink-0 tabular-nums text-neutral-900">
                          {formatNPR(line.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Link href="/techdarbar/fees/day-book" className="w-full">
              <Button variant="outline" className="w-full">
                <BookOpenText className="size-4" />
                Open day book
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: "success" | "neutral" | "destructive";
}) {
  const accents = {
    success: "bg-emerald-50 text-emerald-700",
    neutral: "bg-primary/10 text-primary",
    destructive: "bg-red-50 text-red-700",
  } as const;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
              {value}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
          </div>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${accents[tone]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
