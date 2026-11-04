"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Search, FilterX, Pencil, ExternalLink, Loader2, MapPin, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { EVENT_STATUSES, EVENT_CATEGORIES } from "@/lib/validators/events";
import { listEvents } from "@/server/actions/events";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

const CATEGORY_LABEL: Record<string, string> = {
  WORKSHOP: "Workshop",
  SEMINAR: "Seminar",
  OPEN_HOUSE: "Open House",
  CERTIFICATION: "Certification",
  OTHER: "Other",
};

const STATUS_VARIANT: Record<string, "default" | "accent" | "success" | "outline" | "destructive"> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  CANCELLED: "destructive",
};

const CATEGORY_VARIANT: Record<string, "default" | "accent" | "success" | "outline" | "destructive" | "secondary" | "warning"> = {
  WORKSHOP: "default",
  SEMINAR: "secondary",
  OPEN_HOUSE: "accent",
  CERTIFICATION: "warning",
  OTHER: "outline",
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...EVENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  ...EVENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
];

function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-NP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  });
}

type EventRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  startsAt: string | Date;
  location: string | null;
  capacity: number | null;
  status: string;
};

type Props<TRow extends EventRow = EventRow> = {
  initialRows: TRow[];
  initialTotal: number;
  initialPage: number;
  initialPageCount: number;
  initialFilters: { q: string; status: string; category: string; page: number };
  canWrite: boolean;
};

export function EventsTableClient<TRow extends EventRow = EventRow>({
  initialRows,
  initialTotal,
  initialPage,
  initialPageCount,
  initialFilters,
  canWrite,
}: Props<TRow>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = React.useState<TRow[]>(initialRows);
  const [total, setTotal] = React.useState(initialTotal);
  const [page, setPage] = React.useState(initialPage);
  const [pageCount, setPageCount] = React.useState(initialPageCount);
  const [filters, setFilters] = React.useState(initialFilters);
  const [loading, setLoading] = React.useState(false);

  const applyFilters = React.useCallback(
    async (next: Partial<typeof filters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next, page: next.page ?? 1 };

      if (merged.q) params.set("q", merged.q);
      else params.delete("q");
      if (merged.status) params.set("status", merged.status);
      else params.delete("status");
      if (merged.category) params.set("category", merged.category);
      else params.delete("category");
      if (merged.page > 1) params.set("page", String(merged.page));
      else params.delete("page");

      router.replace(`/techdarbar/events?${params.toString()}`, { scroll: false });

      setLoading(true);
      try {
        const result = await listEvents({
          q: merged.q || undefined,
          status: merged.status || undefined,
          category: merged.category || undefined,
          page: merged.page,
        });
        if (result.ok) {
          setRows(result.data.rows as unknown as TRow[]);
          setTotal(result.data.total);
          setPage(result.data.page);
          setPageCount(result.data.pageCount);
        }
      } catch {
      } finally {
        setLoading(false);
      }
      setFilters(merged);
    },
    [filters, router, searchParams]
  );

  const hasFilters = !!(filters.q || filters.status || filters.category);

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
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="event-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="event-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Title or URL"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-48">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="event-status">
              Status
            </label>
            <Select
              id="event-status"
              value={filters.status}
              onChange={(event) => applyFilters({ status: event.target.value })}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="lg:w-52">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="event-category">
              Category
            </label>
            <Select
              id="event-category"
              value={filters.category}
              onChange={(event) => applyFilters({ category: event.target.value })}
              options={CATEGORY_OPTIONS}
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => applyFilters({ q: "", status: "", category: "" })}
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-neutral-200 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    No events match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/techdarbar/events/${row.id}`}
                        className="font-semibold text-neutral-900 hover:text-primary"
                      >
                        {row.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span className="truncate">/events/{row.slug}</span>
                        {row.capacity != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3" />
                            {row.capacity}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={CATEGORY_VARIANT[row.category] ?? "outline"}>
                      {CATEGORY_LABEL[row.category] ?? row.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-700">
                    {formatDateTime(row.startsAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-neutral-700 max-w-[200px]">
                      <MapPin className="size-3 shrink-0 text-neutral-400" />
                      <span className="truncate">{row.location ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/events/${row.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        title="View public page"
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                      {canWrite && (
                        <Link
                          href={`/techdarbar/events/${row.id}`}
                          title="Edit event"
                          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        >
                          <Pencil className="size-4" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Page {page} of {pageCount} · {total} event{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => applyFilters({ page: page - 1 })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || loading}
            onClick={() => applyFilters({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
