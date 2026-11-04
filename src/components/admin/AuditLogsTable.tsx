"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Search,
  FilterX,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/common/Badge";
import { formatDateTime } from "@/lib/format";
import type { AuditLogFilters } from "@/lib/validators/audit";

const ACTION_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "outline" | "accent"> = {
  create: "success",
  update: "accent",
  delete: "destructive",
  login: "default",
  role: "warning",
};

function pickVariant(action: string): "default" | "success" | "warning" | "destructive" | "outline" | "accent" {
  const lower = action.toLowerCase();
  for (const [key, value] of Object.entries(ACTION_VARIANT)) {
    if (lower.includes(key)) return value;
  }
  return "outline";
}

function truncate(text: string | null, max: number): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type AuditLogRow = {
  id: string;
  createdAt: string | Date;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string | null;
};

type Props = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: AuditLogFilters;
};

export function AuditLogsTable({ rows, total, page, pageCount, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qDraft, setQDraft] = React.useState(filters.q ?? "");
  const [entityDraft, setEntityDraft] = React.useState(filters.entity ?? "");
  const [actionDraft, setActionDraft] = React.useState(filters.action ?? "");

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (qDraft.trim()) params.set("q", qDraft.trim());
    else params.delete("q");
    if (entityDraft.trim()) params.set("entity", entityDraft.trim());
    else params.delete("entity");
    if (actionDraft.trim()) params.set("action", actionDraft.trim());
    else params.delete("action");
    params.delete("page");
    router.replace(`/techdarbar/audit-log?${params.toString()}`, { scroll: false });
  };

  const clearFilters = () => {
    setQDraft("");
    setEntityDraft("");
    setActionDraft("");
    router.replace("/techdarbar/audit-log", { scroll: false });
  };

  const hasFilters = !!(filters.q || filters.entity || filters.action);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <form onSubmit={applyFilters} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="audit-q">
              Search actor / summary
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="audit-q"
                value={qDraft}
                onChange={(event) => setQDraft(event.target.value)}
                placeholder="admin@site.com or summary text"
                className="pl-10"
              />
            </div>
          </div>

          <div className="lg:w-48">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="audit-entity">
              Entity
            </label>
            <Input
              id="audit-entity"
              value={entityDraft}
              onChange={(event) => setEntityDraft(event.target.value)}
              placeholder="User, Course…"
            />
          </div>

          <div className="lg:w-48">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="audit-action">
              Action
            </label>
            <Input
              id="audit-action"
              value={actionDraft}
              onChange={(event) => setActionDraft(event.target.value)}
              placeholder="update, create…"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              <ClipboardList className="size-4" />
              Apply
            </Button>
            {hasFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX className="size-4" />
                Clear
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Entity ID</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    <FileText className="mx-auto mb-2 size-8 text-neutral-300" />
                    No audit records match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.actorEmail ?? <span className="text-neutral-400">system</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={pickVariant(row.action)} className="font-mono text-[11px]">
                      {row.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {row.entity ?? <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">
                    {row.entityId ? truncate(row.entityId, 16) : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div className="max-w-sm">{truncate(row.summary, 100)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Page {page} of {pageCount} · {total} record{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/audit-log?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/audit-log?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
