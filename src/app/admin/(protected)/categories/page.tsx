import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  adminListCategories,
  adminListCategoryGroups,
} from "@/server/dal/categories";
import { categoryFilterSchema } from "@/lib/validators/course";

export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

/**
 * Categories and their groups (docs/05 §4.4). These two tables decide the
 * `/courses` filter groups, the inquiry dropdown grouping and the category
 * directory, so a rename here is a user-visible change.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("category.manage");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = categoryFilterSchema.parse(raw);

  const [result, groups] = await Promise.all([
    adminListCategories(filters),
    adminListCategoryGroups(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Categories" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Layers className="size-6 text-primary" />
          Categories
        </h1>
        <p className="text-sm text-neutral-600">
          {groups.length} groups and {result.total} categor{result.total === 1 ? "y" : "ies"}{" "}
          in this view. Categories group the catalog filters on /courses; deactivating one
          hides it from new courses but keeps existing courses and old links working.
        </p>
      </div>

      <CategoriesManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          group: filters.group ?? "",
        }}
        groups={groups.map((group) => ({
          value: group.id,
          label: `${group.label} (${group.categoryCount})`,
        }))}
        canManage={can(user.role, "category.manage")}
      />
    </div>
  );
}
