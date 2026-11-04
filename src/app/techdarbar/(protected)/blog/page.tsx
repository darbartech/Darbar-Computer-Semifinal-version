import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { BlogTableClient } from "@/components/admin/BlogTableClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListBlogPosts } from "@/server/dal/blog";
import { blogFilterSchema } from "@/lib/validators/blog";

export const metadata: Metadata = {
  title: "Blog",
  robots: { index: false, follow: false },
};

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("blog.write");

  const sp = await searchParams;

  const raw = Object.fromEntries(
    Object.entries(sp).filter(
      ([, value]) => typeof value === "string" && value !== ""
    )
  );
  const filters = blogFilterSchema.parse(raw);

  const result = await adminListBlogPosts(filters);
  const canWrite = can(user.role, "blog.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Blog" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Newspaper className="size-6 text-primary" />
            Blog
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} post{result.total === 1 ? "" : "s"} in this view.
            Published posts appear on /blog immediately.
          </p>
        </div>
        {canWrite && (
          <Link href="/techdarbar/blog/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New post
          </Link>
        )}
      </div>

      <BlogTableClient
        initialRows={result.rows}
        initialTotal={result.total}
        initialPage={result.page}
        initialPageCount={result.pageCount}
        initialFilters={{
          q: filters.q ?? "",
          status: filters.status ?? "",
          page: result.page,
        }}
        canWrite={canWrite}
      />
    </div>
  );
}
