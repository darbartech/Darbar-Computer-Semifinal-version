"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { saveCategory } from "@/server/actions/courses";
import type { AdminCategoryRow } from "@/server/dal/categories";
import {
  categoryWriteSchema,
  type CategoryWriteInput,
  type CategoryWriteValues,
} from "@/lib/validators/course";

/**
 * Category editor (docs/05 §4.4). Create and edit share one inline form so there
 * is only one place where a slug or a description is written.
 */
type Props = {
  rows: AdminCategoryRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; group: string };
  groups: SelectOption[];
  canManage: boolean;
};

type Editing = CategoryWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  groupId: "",
  name: "",
  slug: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function CategoriesManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  groups,
  canManage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<Editing | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryWriteInput, unknown, CategoryWriteValues>({
    resolver: zodResolver(categoryWriteSchema),
    defaultValues: EMPTY,
  });

  const applyFilters = (next: Partial<typeof filters>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...filters, ...next };
    if (merged.q) params.set("q", merged.q);
    else params.delete("q");
    if (merged.group) params.set("group", merged.group);
    else params.delete("group");
    params.delete("page");
    router.replace(`/admin/categories?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    setEditing({ ...EMPTY, groupId: filters.group || groups[0]?.value || "" });
    reset({ ...EMPTY, groupId: filters.group || groups[0]?.value || "" });
  };

  const startEdit = (row: AdminCategoryRow) => {
    const next: Editing = {
      id: row.id,
      groupId: row.groupId,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
    setEditing(next);
    reset(next);
  };

  const onSubmit = async (values: CategoryWriteValues) => {
    const result = await saveCategory(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof CategoryWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: values.id ? "Category updated" : "Category created", variant: "success" });
    setEditing(null);
    reset(EMPTY);
    router.refresh();
  };

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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="category-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="category-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Category name or URL"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-64">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="category-group">
              Group
            </Label>
            <Select
              id="category-group"
              value={filters.group}
              onChange={(event) => applyFilters({ group: event.target.value })}
              options={[{ value: "", label: "All groups" }, ...groups]}
            />
          </div>

          {canManage && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New category
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">
              {editing.id ? "Edit category" : "New category"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setEditing(null);
                reset(EMPTY);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Name</Label>
              <Input
                {...register("name")}
                onChange={(event) => {
                  if (!editing.id) setValue("slug", slugify(event.target.value));
                }}
              />
              {errors.name?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">URL</Label>
              <Input {...register("slug")} />
              {errors.slug?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.slug.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Group</Label>
              <Select {...register("groupId")} options={groups} />
              {errors.groupId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.groupId.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Order</Label>
              <Input type="number" min={0} {...register("sortOrder")} />
              {errors.sortOrder?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.sortOrder.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Description</Label>
            <Textarea rows={3} {...register("description")} />
            {errors.description?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.description.message}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              {...register("isActive")}
            />
            Active (visible in the catalog filters)
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing.id ? "Save changes" : "Create category"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                reset(EMPTY);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Group</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Courses</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    No categories match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{row.name}</div>
                    <div className="text-xs text-neutral-500">/courses?category={row.slug}</div>
                    {row.description && (
                      <div className="mt-1 max-w-md truncate text-xs text-neutral-600">
                        {row.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.groupLabel}</td>
                  <td className="px-4 py-3 text-neutral-700">{row.sortOrder}</td>
                  <td className="px-4 py-3 text-neutral-700">{row.courseCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.isActive ? "success" : "outline"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(row)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Page {page} of {pageCount} · {total} categor{total === 1 ? "y" : "ies"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/admin/categories?${params.toString()}`, { scroll: false });
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
              router.replace(`/admin/categories?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
