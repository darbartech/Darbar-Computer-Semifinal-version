"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  Pencil,
  Star,
  Search,
  Loader2,
  FilterX,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { duplicateCourse, setCourseArchived } from "@/server/actions/courses";
import type { AdminCourseListRow } from "@/server/dal/courses";
import { COURSE_STATUS_OPTIONS, COURSE_STATUSES } from "@/lib/validators/course";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Admin course table (docs/05 §4.4). Filters live in the URL so a filtered view
 * can be shared or bookmarked; the page re-runs the DAL query from those params.
 */
type Filters = {
  q: string;
  status: string;
  category: string;
  featured: boolean;
};

type Props = {
  rows: AdminCourseListRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: Filters;
  categoryOptions: SelectOption[];
  canWrite: boolean;
  canArchive: boolean;
};

const STATUS_VARIANT: Record<string, "default" | "accent" | "success" | "outline" | "destructive"> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  ARCHIVED: "destructive",
};

function formatFee(feeNPR: number): string {
  return `NPR ${feeNPR.toLocaleString("en-NP")}`;
}

function formatUpdated(iso: string): string {
  return fmtDate(iso, { dateStyle: "medium", timeStyle: "short" });
}

export function CoursesTable({
  rows,
  total,
  page,
  pageCount,
  filters,
  categoryOptions,
  canWrite,
  canArchive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const applyFilters = React.useCallback(
    (next: Partial<Filters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      if (merged.q) params.set("q", merged.q);
      else params.delete("q");
      if (merged.status) params.set("status", merged.status);
      else params.delete("status");
      if (merged.category) params.set("category", merged.category);
      else params.delete("category");
      if (merged.featured) params.set("featured", "1");
      else params.delete("featured");
      params.delete("page");

      router.replace(`/techdarbar/courses?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  const onToggleArchive = async (row: AdminCourseListRow) => {
    setPendingId(row.id);
    try {
      const archived = row.status !== "ARCHIVED";
      const result = await setCourseArchived({ id: row.id, archived });
      if (!result.ok) {
        toast({ title: "Could not update status", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: archived ? `Archived ${row.title}` : `Restored ${row.title}`,
        description: archived
          ? "Its public page now returns 404."
          : "It is back as a draft until you publish it again.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  const onDuplicate = async (row: AdminCourseListRow) => {
    setPendingId(row.id);
    try {
      const result = await duplicateCourse({
        id: row.id,
        slug: `${row.slug}-copy`,
      });
      if (!result.ok) {
        toast({ title: "Could not duplicate course", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: "Duplicated as draft",
        description: `Open /admin/courses/${result.data.id} and give it a final title and URL.`,
        variant: "success",
      });
      router.push(`/techdarbar/courses/${result.data.id}`);
    } finally {
      setPendingId(null);
    }
  };

  const hasFilters = !!(filters.q || filters.status || filters.category || filters.featured);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("q");
              applyFilters({ q: typeof value === "string" ? value : "" });
            }}
          >
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="course-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="course-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Title, URL or tagline"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-52">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="course-status">
              Status
            </label>
            <Select
              id="course-status"
              value={filters.status}
              onChange={(event) => applyFilters({ status: event.target.value })}
              options={[
                { value: "", label: "All statuses" },
                ...COURSE_STATUS_OPTIONS.map((option) => ({ ...option })),
              ]}
            />
          </div>

          <div className="lg:w-64">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="course-category">
              Category
            </label>
            <Select
              id="course-category"
              value={filters.category}
              onChange={(event) => applyFilters({ category: event.target.value })}
              options={[
                { value: "", label: "All categories" },
                ...categoryOptions,
              ]}
            />
          </div>

          <Button
            type="button"
            variant={filters.featured ? "default" : "outline"}
            onClick={() => applyFilters({ featured: !filters.featured })}
            className="h-11"
          >
            <Star className={cn("size-4", filters.featured && "fill-current")} />
            Featured only
          </Button>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => applyFilters({ q: "", status: "", category: "", featured: false })}
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Level</th>
                <th className="px-4 py-3 font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Fee</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-neutral-500">
                    No courses match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const busy = pendingId === row.id;
                return (
                  <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/techdarbar/courses/${row.id}`}
                            className="font-semibold text-neutral-900 hover:text-primary"
                          >
                            {row.title}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span className="truncate">/courses/{row.slug}</span>
                            {row.isFeatured && (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <Star className="size-3 fill-current" />
                                {row.featuredOrder ?? "-"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.categoryName}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.level}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.durationWeeks} wk</td>
                    <td className="px-4 py-3 text-neutral-700">{formatFee(row.feeNPR)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                        {row.status === "PUBLISHED"
                          ? "Published"
                          : row.status === "ARCHIVED"
                            ? "Archived"
                            : "Draft"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-500">
                      {formatUpdated(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/courses/${row.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          title="View public page"
                          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                        {canWrite && (
                          <>
                            <Link
                              href={`/techdarbar/courses/${row.id}`}
                              title="Edit course"
                              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                            >
                              <Pencil className="size-4" />
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="Duplicate as draft"
                              disabled={busy}
                              onClick={() => onDuplicate(row)}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </>
                        )}
                        {canArchive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={row.status === "ARCHIVED" ? "Restore as draft" : "Archive course"}
                            disabled={busy}
                            onClick={() => onToggleArchive(row)}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : row.status === "ARCHIVED" ? (
                              <ArchiveRestore className="size-4" />
                            ) : (
                              <Archive className="size-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Page {page} of {pageCount} · {total} course{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/courses?${params.toString()}`, { scroll: false });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page + 1));
              router.replace(`/techdarbar/courses?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export { COURSE_STATUSES };
