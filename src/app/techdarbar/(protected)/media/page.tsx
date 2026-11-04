import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { MediaGrid } from "@/components/admin/MediaGrid";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "Media Library",
  robots: { index: false, follow: false },
};

export default async function AdminMediaPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Role check happens on the server. Hiding the nav item is cosmetic only.
  const user = await requirePermission("media.read");

  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const { rows, total, pageCount } = await adminListMedia({
    q: query || undefined,
    page,
  });

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Media library" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <FolderOpen className="size-6 text-primary" />
          Media library
        </h1>
        <p className="text-sm text-neutral-600">
          {total} image{total === 1 ? "" : "s"}
          {query ? ` matching “${query}”` : ""}. Alt text is required on every
          image, and an image that is in use cannot be deleted.
        </p>
      </div>

      <MediaGrid
        items={rows}
        total={total}
        page={page}
        pageCount={pageCount}
        query={query}
        canUpload={can(user.role, "media.upload")}
        canDelete={can(user.role, "media.delete")}
      />
    </div>
  );
}