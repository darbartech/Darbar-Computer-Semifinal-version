import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { FeesManager } from "@/components/admin/fees/FeesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  listDues,
  listFeeFilterOptions,
  listInvoices,
  listPayments,
} from "@/server/dal/fees";
import { feeFilterSchema } from "@/lib/validators/fees";

export const metadata: Metadata = {
  title: "Fees",
  robots: { index: false, follow: false },
};

export default async function AdminFeesPage({
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
  const filters = parsed.success ? parsed.data : feeFilterSchema.parse({});

  const options = await listFeeFilterOptions();

  // One tab is read per request: the Dues tab is the accountant's landing screen and
  // is the only one that counts the aging buckets over every open bill.
  const result =
    filters.tab === "dues"
      ? { dues: await listDues(filters) }
      : filters.tab === "invoices"
        ? { invoices: await listInvoices(filters) }
        : { payments: await listPayments(filters) };

  return (
    <FeesShell
      can={feeFlags(user.role)}
      tab={filters.tab}
      filters={filterState(filters)}
      courses={options.courses}
      batches={options.batches}
      {...result}
    />
  );
}

function feeFlags(role: Parameters<typeof can>[0]) {
  return {
    issue: can(role, "invoice.issue"),
    voidInvoice: can(role, "invoice.void"),
    record: can(role, "payment.record"),
    voidPayment: can(role, "payment.void"),
  };
}

/** The URL values the client controls; `""` means "no filter" for every field. */
function filterState(filters: ReturnType<typeof feeFilterSchema.parse>) {
  return {
    q: filters.q ?? "",
    aging: filters.aging,
    status: filters.status ?? "",
    method: filters.method ?? "",
    courseId: filters.courseId ?? "",
    batchId: filters.batchId ?? "",
    day: filters.day ?? "",
  };
}

function FeesShell(props: React.ComponentProps<typeof FeesManager>) {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Fees" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Wallet className="size-6 text-primary" />
          Fees
        </h1>
        <p className="text-sm text-neutral-600">
          Dues are what the institute is still owed. Balances are computed from the
          receipts on file — a payment is never edited, only voided and re-taken.
        </p>
      </div>

      <FeesManager {...props} />
    </div>
  );
}
