import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { BlogFormClient } from "@/components/admin/BlogFormClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { listRecentMedia } from "@/server/dal/media";

export const metadata: Metadata = {
  title: "New blog post",
  robots: { index: false, follow: false },
};

export default async function NewBlogPage() {
  const user = await requirePermission("blog.write");
  const library = await listRecentMedia(24);
  const canWrite = can(user.role, "blog.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Blog", href: "/admin/blog" },
          { label: "New post" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          New blog post
        </h1>
        <p className="text-sm text-neutral-600">
          Fill in the title and excerpt first — the URL is auto-generated from
          the title. Nothing is public until you set the status to Published.
        </p>
      </div>

      <Link
        href="/admin/blog"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Back to blog
      </Link>

      <BlogFormClient library={library} canWrite={canWrite} />
    </div>
  );
}
