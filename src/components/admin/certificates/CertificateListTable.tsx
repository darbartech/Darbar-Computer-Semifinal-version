"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, FilterX, Loader2, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { deleteCertificateAction } from "@/server/actions/certificates";
import type {
  AdminCertificateListRow,
  CertificateStatusValue,
} from "@/server/types/certificates";
import { CERTIFICATE_STATUSES } from "@/server/types/certificates";
import { CERTIFICATE_PAGE_SIZE } from "@/lib/validators/certificates";
import { STATUS_VARIANT, statusLabel } from "./status";
import { cn } from "@/lib/utils";

type Filters = {
  q: string;
  status: string;
  courseId: string;
};

type Props = {
  rows: AdminCertificateListRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: Filters;
  courseOptions: SelectOption[];
  counts: Record<CertificateStatusValue, number>;
  canDelete: boolean;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    dateStyle: "medium",
    timeZone: "Asia/Kathmandu",
  });
}

export function CertificateListTable({
  rows,
  total,
  page,
  pageCount,
  filters,
  courseOptions,
  counts,
  canDelete,
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
      if (merged.courseId) params.set("courseId", merged.courseId);
      else params.delete("courseId");
      params.delete("page");
      router.replace(`/techdarbar/certificates?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next > 1) params.set("page", String(next));
    else params.delete("page");
    router.replace(`/techdarbar/certificates?${params.toString()}`, { scroll: false });
  };

  const onDelete = async (row: AdminCertificateListRow) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete draft certificate ${row.certificateNumber ?? "?"}? This cannot be undone.`)) return;
    setPendingId(row.id);
    try {
      const result = await deleteCertificateAction({ id: row.id });
      if (!result.ok) {
        toast({ title: "Could not delete", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: "Draft deleted",
        description: "Certificate removed from the list.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  const hasFilters = !!(filters.q || filters.status || filters.courseId);
  const activeStatus = filters.status ?? "";

  const statusTabs: Array<{ value: string; label: string; count: number }> = [
    {
      value: "",
      label: "All",
      count: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
    ...CERTIFICATE_STATUSES.map((status) => ({
      value: status,
      label: statusLabel(status),
      count: counts[status],
    })),
  ];

  const pageStart = rows.length ? (page - 1) * CERTIFICATE_PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(page * CERTIFICATE_PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1.5">
        {statusTabs.map((tab) => {
          const isActive = activeStatus === tab.value;
          return (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => applyFilters({ status: tab.value })}
              aria-pressed={isActive}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-neutral-100 text-neutral-500"
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

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
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="cert-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="cert-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Certificate number, recipient, or course"
                className="pl-10 pr-16"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center rounded-md bg-neutral-100 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
              >
                Search
              </button>
            </div>
          </form>

          <div className="lg:w-64">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="cert-course">
              Course
            </label>
            <Select
              id="cert-course"
              value={filters.courseId}
              onChange={(event) => applyFilters({ courseId: event.target.value })}
              options={[
                { value: "", label: "All courses" },
                ...courseOptions,
              ]}
            />
          </div>

          {hasFilters && (
            <Button
              variant="outline"
              type="button"
              onClick={() => applyFilters({ q: "", status: "", courseId: "" })}
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Certificate No.</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-neutral-500" colSpan={6}>
                    <div className="flex flex-col items-center gap-2">
                      <p>No certificates match these filters.</p>
                      {hasFilters && (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => applyFilters({ q: "", status: "", courseId: "" })}
                        >
                          <FilterX className="size-4" />
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-800">
                      {row.certificateNumber ?? (
                        <span className="text-neutral-400 italic">unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/techdarbar/certificates/${row.id}`}
                        className="font-medium text-neutral-900 hover:text-primary hover:underline"
                      >
                        {row.recipientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.courseName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                        {statusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(row.issueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {(row.status === "ISSUED" || row.status === "REISSUED") && (
                          <a
                            href={`/api/techdarbar/certificates/${row.id}/download`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            title="Download PDF"
                            aria-label="Download PDF"
                          >
                            <FileDown className="size-4" />
                          </a>
                        )}
                        {canDelete &&
                          (row.status === "DRAFT" || row.status === "PENDING_ISSUE") && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              type="button"
                              disabled={pendingId === row.id}
                              onClick={() => onDelete(row)}
                              title="Delete draft"
                              aria-label="Delete draft"
                              className="text-destructive/80 hover:text-destructive"
                            >
                              {pendingId === row.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(pageCount > 1 || total > 0) && (
          <div className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-neutral-500">
              Showing {pageStart}–{pageEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="min-w-[3rem] text-center text-sm text-neutral-600">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}