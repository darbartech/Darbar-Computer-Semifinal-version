"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import {
  saveSignatory,
  deleteSignatoryAction,
} from "@/server/actions/certificates";
import { signatoryWriteSchema } from "@/lib/validators/certificates";

type Row = {
  id: string;
  name: string;
  title: string;
  designation: string;
  signatureUrl: string | null;
  isActive: boolean;
  displayOrder: number;
};

type Props = {
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; isActive: string };
  canManage: boolean;
};

const EMPTY = {
  id: "",
  name: "",
  title: "",
  designation: "",
  signatureUrl: "",
  isActive: "true",
  displayOrder: "0",
};

export function SignatoriesManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  canManage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [form, setForm] = React.useState(EMPTY);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const applyFilters = (next: Partial<{ q: string; isActive: string }>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { q: filters.q, isActive: filters.isActive, ...next };
    if (merged.q) params.set("q", merged.q);
    else params.delete("q");
    if (merged.isActive) params.set("isActive", merged.isActive);
    else params.delete("isActive");
    params.delete("page");
    router.push(`/techdarbar/signatories?${params.toString()}`);
  };

  const edit = (row: Row) => {
    setForm({
      id: row.id,
      name: row.name,
      title: row.title,
      designation: row.designation,
      signatureUrl: row.signatureUrl ?? "",
      isActive: String(row.isActive),
      displayOrder: String(row.displayOrder),
    });
    setErrors({});
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = signatoryWriteSchema.safeParse({
      id: form.id || undefined,
      name: form.name,
      title: form.title,
      designation: form.designation,
      signatureUrl: form.signatureUrl || undefined,
      isActive: form.isActive,
      displayOrder: form.displayOrder,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const next: Record<string, string> = {};
      for (const [key, messages] of Object.entries(flat)) {
        if (messages?.[0]) next[key] = messages[0];
      }
      setErrors(next);
      toast({
        title: "Please fix the highlighted fields",
        variant: "error",
      });
      return;
    }

    const result = await saveSignatory(parsed.data);
    if (!result.ok) {
      if (result.fieldErrors) {
        const next: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) next[key] = messages[0];
        }
        setErrors(next);
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({ title: form.id ? "Signatory updated" : "Signatory created", variant: "success" });
    setForm(EMPTY);
    setErrors({});
    router.refresh();
  };

  const onDelete = async (row: Row) => {
    if (!window.confirm(`Delete signatory "${row.name}"? Issued certificates keep their own snapshot.`)) {
      return;
    }
    setPendingId(row.id);
    const result = await deleteSignatoryAction({ id: row.id });
    setPendingId(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    if (form.id === row.id) setForm(EMPTY);
    toast({ title: "Signatory deleted", variant: "success" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 lg:grid-cols-2"
        >
          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="sig-name">
              Name
            </Label>
            <Input
              id="sig-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Institute Director"
            />
            {errors.name && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.name}</p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="sig-title">
              Title
            </Label>
            <Input
              id="sig-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Executive Director"
            />
            {errors.title && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.title}</p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="sig-desig">
              Designation
            </Label>
            <Input
              id="sig-desig"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              placeholder="e.g. Darbar Computer Institute"
            />
            {errors.designation && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.designation}</p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="sig-sig">
              Signature image URL (optional)
            </Label>
            <Input
              id="sig-sig"
              value={form.signatureUrl}
              onChange={(e) => setForm({ ...form, signatureUrl: e.target.value })}
              placeholder="https://…"
            />
            {errors.signatureUrl && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.signatureUrl}</p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="sig-order">
                Display order
              </Label>
              <Input
                id="sig-order"
                className="w-28"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={form.isActive === "true"}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked ? "true" : "false" })
                }
                className="size-4 rounded border-neutral-300"
              />
              Active
            </label>
          </div>
          <div className="flex items-end justify-end gap-2">
            {form.id && (
              <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)}>
                Cancel
              </Button>
            )}
            <Button type="submit">
              {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
              {form.id ? "Save changes" : "Add signatory"}
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="min-w-[14rem] flex-1">
          <Label className="mb-1.5 block text-xs font-semibold text-neutral-600" htmlFor="sig-q">
            Search
          </Label>
          <Input
            id="sig-q"
            defaultValue={filters.q}
            placeholder="Name, title or designation"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFilters({ q: (e.target as HTMLInputElement).value });
              }
            }}
          />
        </div>
        <div className="w-44">
          <Label className="mb-1.5 block text-xs font-semibold text-neutral-600" htmlFor="sig-active">
            Status
          </Label>
          <Select
            id="sig-active"
            value={filters.isActive}
            onChange={(e) => applyFilters({ isActive: e.target.value })}
            options={[
              { value: "", label: "All" },
              { value: "true", label: "Active only" },
              { value: "false", label: "Inactive only" },
            ]}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => applyFilters({ q: "", isActive: "" })}>
          Reset
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500">
                    No signatories match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-600">{row.displayOrder}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{row.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.designation}</td>
                    <td className="px-4 py-3">
                      <Badge variant={row.isActive ? "success" : "outline"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => edit(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            type="button"
                            disabled={pendingId === row.id}
                            onClick={() => onDelete(row)}
                            aria-label={`Delete ${row.name}`}
                            className="text-destructive/80 hover:text-destructive"
                          >
                            {pendingId === row.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
            <p className="text-xs text-neutral-500">
              Page {page} of {pageCount} ({total} total)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("page", String(page - 1));
                  router.push(`/techdarbar/signatories?${params.toString()}`);
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
                  router.push(`/techdarbar/signatories?${params.toString()}`);
                }}
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