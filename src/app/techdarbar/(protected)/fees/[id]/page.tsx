import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { InvoiceDetailPanel } from "@/components/admin/fees/InvoiceDetailPanel";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { getInvoiceDetail } from "@/server/dal/fees";
import { agingOf } from "@/server/services/fees";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("fee.read");
  const { id } = await params;

  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();

  // Recomputed here rather than carried on the row: aging is a statement about
  // today, and the page must say the same thing the Dues chips said this morning.
  const aging = agingOf(invoice.dueDate);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Fees", href: "/techdarbar/fees?tab=invoices" },
          { label: invoice.number },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <ReceiptText className="size-6 text-primary" />
            {invoice.number}
          </h1>
          <p className="text-sm text-neutral-600">
            {invoice.studentName} · {invoice.studentCode}
          </p>
        </div>
        <Link href="/techdarbar/fees?tab=invoices">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back to invoices
          </Button>
        </Link>
      </div>

      <InvoiceDetailPanel
        invoice={invoice}
        aging={{ bucket: aging.bucket, daysOverdue: aging.daysOverdue }}
        can={{
          issue: can(user.role, "invoice.issue"),
          voidInvoice: can(user.role, "invoice.void"),
          record: can(user.role, "payment.record"),
          voidPayment: can(user.role, "payment.void"),
        }}
      />
    </div>
  );
}
