import type { Metadata } from "next";
import { Signature } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { SignatoriesManager } from "@/components/admin/certificates/SignatoriesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListSignatories } from "@/server/dal/certificates";
import { signatoryFilterSchema } from "@/lib/validators/certificates";

export const metadata: Metadata = {
  title: "Signatories",
  robots: { index: false, follow: false },
};

/**
 * Authorized signatories available on the certificate issue dialog. Deleting a
 * signatory never touches issued certificates: each issued certificate keeps its
 * own frozen snapshot of the name, title and designation that was signed.
 */
export default async function AdminSignatoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("certificate.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = signatoryFilterSchema.parse(raw);

  const result = await adminListSignatories(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Certificates", href: "/techdarbar/certificates" },
          { label: "Signatories" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Signature className="size-6 text-primary" />
          Signatories
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} signator{result.total === 1 ? "y" : "ies"}. These are the people
          allowed to sign a certificate. When a certificate is issued, the signatory name and
          title are copied onto it, so later edits here do not rewrite history.
        </p>
      </div>

      <SignatoriesManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          isActive:
            filters.isActive === undefined ? "" : String(filters.isActive),
        }}
        canManage={can(user.role, "certificate.signatory.manage")}
      />
    </div>
  );
}