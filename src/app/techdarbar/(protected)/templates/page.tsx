import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { TemplatesManager } from "@/components/admin/certificates/TemplatesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListTemplates } from "@/server/dal/certificates";
import { templateFilterSchema } from "@/lib/validators/certificates";

export const metadata: Metadata = {
  title: "Certificate templates",
  robots: { index: false, follow: false },
};

/**
 * Certificate layout templates. A template row only records which layout a
 * draft should use; the rendered PDF is produced from the approved PSD layout in
 * src/server/certificates/pdf, so templates never change the printed design.
 */
export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("certificate.read");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = templateFilterSchema.parse(raw);

  const result = await adminListTemplates(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Certificates", href: "/techdarbar/certificates" },
          { label: "Templates" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <LayoutTemplate className="size-6 text-primary" />
          Certificate templates
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} template{result.total === 1 ? "" : "s"}. A template records which
          approved layout a certificate uses. Name plus version must be unique, so you can
          stage a new layout version without touching certificates already issued.
        </p>
      </div>

      <TemplatesManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          isActive:
            filters.isActive === undefined ? "" : String(filters.isActive),
        }}
        canManage={can(user.role, "certificate.template.manage")}
      />
    </div>
  );
}