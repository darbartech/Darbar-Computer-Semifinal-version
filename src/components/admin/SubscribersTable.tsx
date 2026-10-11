"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Mail,
  Search,
  UserPlus,
  UserMinus,
  Trash2,
  FilterX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SUBSCRIBER_STATUSES } from "@/lib/validators/subscribers";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteSubscriberAction, updateSubscriberAction } from "@/server/actions/subscribers";
import type { SubscriberFilters } from "@/lib/validators/subscribers";

const SUBSCRIBER_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "UNSUBSCRIBED", label: "Unsubscribed" },
];

const STATUS_VARIANT: Record<string, "success" | "outline" | "destructive"> = {
  ACTIVE: "success",
  UNSUBSCRIBED: "outline",
};

type SubscriberRow = {
  id: string;
  email: string;
  source: string | null;
  status: string;
  createdAt: string | Date;
  unsubscribedAt: string | Date | null;
};

type Props = {
  rows: SubscriberRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: SubscriberFilters;
  canUpdate: boolean;
};

export function SubscribersTable({ rows, total, page, pageCount, filters, canUpdate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<SubscriberRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const applyFilters = React.useCallback(
    (next: Partial<SubscriberFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      if (merged.q) params.set("q", merged.q);
      else params.delete("q");
      if (merged.status) params.set("status", merged.status);
      else params.delete("status");
      params.delete("page");

      router.replace(`/admin/subscribers?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  const toggleStatus = async (row: SubscriberRow) => {
    const nextStatus = row.status === "ACTIVE" ? "UNSUBSCRIBED" : "ACTIVE";
    setPendingId(row.id);
    try {
      const result = await updateSubscriberAction({ id: row.id, status: nextStatus });
      if (!result.ok) {
        toast({ title: "Could not update subscriber", description: result.error, variant: "error" });
        return;
      }
      toast({
        title: nextStatus === "ACTIVE" ? "Subscriber reactivated" : "Subscriber unsubscribed",
        variant: "success",
      });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const result = await deleteSubscriberAction(deleteTarget.id);
    setDeleteBusy(false);
    if (!result.ok) {
      toast({ title: "Could not delete subscriber", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Subscriber deleted", variant: "success" });
    setDeleteTarget(null);
    router.refresh();
  };

  const hasFilters = !!(filters.q || filters.status);

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
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="sub-q">
              Search email
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="sub-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="name@example.com"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-52">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="sub-status">
              Status
            </label>
            <Select
              id="sub-status"
              value={filters.status ?? ""}
              onChange={(event) => applyFilters({ status: event.target.value as SubscriberFilters["status"] })}
              options={[
                { value: "", label: "All statuses" },
                ...SUBSCRIBER_STATUS_OPTIONS,
              ]}
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => applyFilters({ q: "", status: undefined })}
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Subscribed</th>
                <th className="px-4 py-3 font-semibold">Unsubscribed</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    <Mail className="mx-auto mb-2 size-8 text-neutral-300" />
                    No subscribers match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const busy = pendingId === row.id;
                return (
                  <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-800">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {row.source ? (
                        <Badge variant="outline">{row.source}</Badge>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                        {row.status === "ACTIVE" ? "Active" : "Unsubscribed"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {row.unsubscribedAt ? formatDateTime(row.unsubscribedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canUpdate && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title={row.status === "ACTIVE" ? "Unsubscribe" : "Reactivate"}
                              disabled={busy}
                              onClick={() => toggleStatus(row)}
                            >
                              {busy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : row.status === "ACTIVE" ? (
                                <UserMinus className="size-4" />
                              ) : (
                                <UserPlus className="size-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="Delete subscriber"
                              disabled={busy}
                              onClick={() => setDeleteTarget(row)}
                              className={cn("text-neutral-500 hover:text-destructive")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
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
          Page {page} of {pageCount} · {total} subscriber{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/admin/subscribers?${params.toString()}`, { scroll: false });
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
              router.replace(`/admin/subscribers?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subscriber?</DialogTitle>
            <DialogDescription>
              This permanently removes {deleteTarget?.email} from the newsletter list. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteBusy} onClick={runDelete}>
              {deleteBusy && <Loader2 className="size-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { SUBSCRIBER_STATUSES };
