import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { BlogFormClient } from "@/components/admin/BlogFormClient";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminGetBlogPost } from "@/server/dal/blog";
import { listRecentMedia } from "@/server/dal/media";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "accent" | "success" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  ARCHIVED: "destructive",
};

export const metadata: Metadata = {
  title: "Edit blog post",
  robots: { index: false, follow: false },
};

export default async function EditBlogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("blog.write");
  const { id } = await params;

  const post = await adminGetBlogPost(id);
  if (!post) notFound();

  const library = await listRecentMedia(24);
  const canWrite = can(user.role, "blog.write");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/techdarbar" },
          { label: "Blog", href: "/techdarbar/blog" },
          { label: post.title },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[post.status] ?? "outline"}>
              {STATUS_LABEL[post.status] ?? post.status}
            </Badge>
            <span className="text-sm text-neutral-500">/blog/{post.slug}</span>
          </div>
        </div>
        <Link
          href="/techdarbar/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to blog
        </Link>
      </div>

      <BlogFormClient post={post} library={library} canWrite={canWrite} />
    </div>
  );
}
