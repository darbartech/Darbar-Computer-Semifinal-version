"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Mail,
  Search,
  CheckCheck,
  MessageSquareReply,
  Trash2,
  FilterX,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { MESSAGE_STATUSES } from "@/lib/validators/messages";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteMessageAction, updateMessageAction } from "@/server/actions/messages";
import type { MessageFilters } from "@/lib/validators/messages";

const MESSAGE_STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "REPLIED", label: "Replied" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "SPAM", label: "Spam" },
];

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
  NEW: "default",
  READ: "success",
  REPLIED: "success",
  ARCHIVED: "outline",
  SPAM: "destructive",
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type MessageRow = {
  id: string;
  createdAt: string | Date;
  name: string;
  email: string;
  subject: string | null;
  status: string;
};

type Props = {
  rows: MessageRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: MessageFilters;
  canUpdate: boolean;
};

export function MessagesTable({ rows, total, page, pageCount, filters, canUpdate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<MessageRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const applyFilters = React.useCallback(
    (next: Partial<MessageFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      if (merged.q) params.set("q", merged.q);
      else params.delete("q");
      if (merged.status) params.set("status", merged.status);
      else params.delete("status");
      params.delete("page");

      router.replace(`/techdarbar/messages?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  const markStatus = async (row: MessageRow, status: "READ" | "REPLIED") => {
    setPendingId(row.id);
    try {
      const result = await updateMessageAction({
        id: row.id,
        status,
        handledAt: status === "REPLIED" ? new Date().toISOString() : null,
      });
      if (!result.ok) {
        toast({ title: "Could not update message", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `Marked as ${status.toLowerCase()}`, variant: "success" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const result = await deleteMessageAction(deleteTarget.id);
    setDeleteBusy(false);
    if (!result.ok) {
      toast({ title: "Could not delete message", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Message deleted", variant: "success" });
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
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="msg-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="msg-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Name, email or subject"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-52">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="msg-status">
              Status
            </label>
            <Select
              id="msg-status"
              value={filters.status ?? ""}
              onChange={(event) => applyFilters({ status: event.target.value as MessageFilters["status"] })}
              options={[
                { value: "", label: "All statuses" },
                ...MESSAGE_STATUS_OPTIONS,
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
                <th className="px-4 py-3 font-semibold">Received</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    <Mail className="mx-auto mb-2 size-8 text-neutral-300" />
                    No messages match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const busy = pendingId === row.id;
                return (
                  <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {truncate(row.name, 30)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{truncate(row.email, 40)}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div className="max-w-xs truncate">{row.subject ? truncate(row.subject, 60) : "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canUpdate && (
                          <>
                            {row.status !== "READ" && row.status !== "REPLIED" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Mark as read"
                                disabled={busy}
                                onClick={() => markStatus(row, "READ")}
                              >
                                {busy && pendingId === row.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <CheckCheck className="size-4" />
                                )}
                              </Button>
                            )}
                            {row.status !== "REPLIED" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Mark as replied"
                                disabled={busy}
                                onClick={() => markStatus(row, "REPLIED")}
                              >
                                {busy && pendingId === row.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <MessageSquareReply className="size-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="Delete message"
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
          Page {page} of {pageCount} · {total} message{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/messages?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/messages?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message?</DialogTitle>
            <DialogDescription>
              This permanently removes the message from {deleteTarget?.email}. This cannot be undone.
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

export { MESSAGE_STATUSES };
