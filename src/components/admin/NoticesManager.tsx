"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Megaphone, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { kathmanduDayKey } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { deleteNoticeAction, saveNoticeAction } from "@/server/actions/notices";
import {
  NOTICE_STATUSES,
  NOTICE_TYPES,
  noticeWriteSchema,
  type NoticeWriteInput,
  type NoticeWriteValues,
} from "@/lib/validators/notices";

type NoticeRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  imageId: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  createdAt: string;
};

type Props = {
  rows: NoticeRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; status: string; type: string };
  library: LibraryImage[];
  canWrite: boolean;
};

type Editing = NoticeWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  type: "ANNOUNCEMENT",
  title: "",
  body: "",
  startsAt: "",
  endsAt: "",
  status: "DRAFT",
  imageId: "",
};

/**
 * The day the editor picked. `kathmanduDayKey`, not `slice(0, 10)`: these columns
 * are `timestamp without time zone`, so a notice saved for the 14th comes back
 * from the driver as `2026-10-13T18:15Z` — slicing the UTC string would show and
 * re-submit the 13th, quietly moving the window a day earlier on every save.
 */
const toDateInput = (iso: string | null) => (iso ? kathmanduDayKey(iso) : "");

const labelOf = (value: string) => value[0] + value.slice(1).toLowerCase();

const statusBadge = (status: string) =>
  status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "outline" : "warning";

const typeBadge = (type: string) =>
  type === "CLOSURE" ? "destructive" : type === "HOLIDAY" ? "secondary" : "accent";

export function NoticesManager({ rows, total, page, pageCount, filters, library, canWrite }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<PickedImage>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NoticeWriteInput, unknown, NoticeWriteValues>({
    resolver: zodResolver(noticeWriteSchema),
    defaultValues: EMPTY,
  });

  const closeForm = () => {
    setEditing(null);
    setImage(null);
    reset(EMPTY);
  };

  const applyFilters = (next: Partial<typeof filters>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...filters, ...next };
    for (const key of ["q", "status", "type"] as const) {
      if (merged[key]) params.set(key, merged[key]);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`/techdarbar/notices?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    setEditing({ ...EMPTY });
    reset({ ...EMPTY });
    setImage(null);
  };

  const startEdit = (row: NoticeRow) => {
    const next: Editing = {
      id: row.id,
      type: row.type as NoticeWriteInput["type"],
      title: row.title,
      body: row.body,
      startsAt: toDateInput(row.startsAt),
      endsAt: toDateInput(row.endsAt),
      status: row.status as NoticeWriteInput["status"],
      imageId: row.imageId ?? "",
    };
    setEditing(next);
    reset(next);
    setImage(
      row.imageId && row.imageUrl
        ? { id: row.imageId, url: row.imageUrl, alt: row.imageAlt ?? "" }
        : null
    );
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onSubmit = async (values: NoticeWriteValues) => {
    let result: Awaited<ReturnType<typeof saveNoticeAction>>;
    try {
      result = await saveNoticeAction(values);
    } catch {
      // An action can be rejected before it returns a result — an expired
      // session makes requirePermission() redirect — which would leave
      // isSubmitting true and the button spinning on an already-saved notice.
      toast({
        title: "Could not save the notice",
        description: "Please sign in again and retry.",
        variant: "error",
      });
      return;
    }
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof NoticeWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({
      title: values.id ? "Notice updated" : "Notice created",
      variant: "success",
    });
    closeForm();
    router.refresh();
  };

  const handleDelete = async (row: NoticeRow) => {
    await ask({
      title: "Delete notice?",
      description: (
        <>
          <span className="font-medium text-neutral-900">{row.title}</span> leaves the banner
          and the notices page immediately. Unpublishing it keeps the text for later; deleting
          leaves only the audit log.
        </>
      ),
      run: async () => {
        setDeletingId(row.id);
        try {
          const result = await deleteNoticeAction(row.id);
          if (!result.ok) return result.error;
          toast({ title: "Notice deleted", variant: "success" });
          router.refresh();
          return null;
        } catch {
          return "Could not delete the notice. Please sign in again and retry.";
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const typeOptions: SelectOption[] = NOTICE_TYPES.map((value) => ({
    value,
    label: labelOf(value),
  }));

  const statusOptions: SelectOption[] = NOTICE_STATUSES.map((value) => ({
    value,
    label: labelOf(value),
  }));

  return (
    <div className="flex flex-col gap-4">
      {canWrite && editing && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">
              {editing.id ? "Edit notice" : "New notice"}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={closeForm}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Type</Label>
              <Select {...register("type")} options={typeOptions} />
              {errors.type?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.type.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Status</Label>
              <Select {...register("status")} options={statusOptions} />
              {errors.status?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.status.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Title *</Label>
              <Input {...register("title")} placeholder="e.g. Institute closed for Chhath" />
              {errors.title?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">From</Label>
              <Input type="date" {...register("startsAt")} />
              {errors.startsAt?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.startsAt.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Upto</Label>
              <Input type="date" {...register("endsAt")} />
              {errors.endsAt?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.endsAt.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Message *</Label>
            <Textarea
              rows={4}
              {...register("body")}
              placeholder="What visitors should know, and what it means for their classes."
            />
            {errors.body?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.body.message}</p>
            )}
          </div>

          <div>
            <ImagePicker
              label="Picture"
              value={image}
              onChange={(next) => {
                setImage(next);
                setValue("imageId", next?.id ?? "", { shouldDirty: true });
              }}
              library={library}
              hint="Optional. Shown above the message in the popup — a closure poster, a holiday greeting."
              disabled={!canWrite}
            />
            {errors.imageId?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.imageId.message}</p>
            )}
          </div>

          <p className="text-xs text-neutral-600">
            Saving as Published shows the notice to visitors at once, so an advance announcement
            works. From and Upto are the period printed in the popup; once Upto has passed the
            notice stops popping up. Leave both empty for an open-ended announcement.
          </p>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing.id ? "Save changes" : "Create notice"}
            </Button>
            <Button type="button" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="n-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="n-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search notices…"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-44">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="n-type">
              Type
            </Label>
            <Select
              id="n-type"
              value={filters.type}
              onChange={(event) => applyFilters({ type: event.target.value })}
              options={[{ value: "", label: "All types" }, ...typeOptions]}
            />
          </div>

          <div className="lg:w-44">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="n-status">
              Status
            </Label>
            <Select
              id="n-status"
              value={filters.status}
              onChange={(event) => applyFilters({ status: event.target.value })}
              options={[{ value: "", label: "All statuses" }, ...statusOptions]}
            />
          </div>

          {canWrite && !editing && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New notice
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Notice</th>
                <th className="px-4 py-3 font-semibold">Picture</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Window</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    <Megaphone className="mx-auto mb-3 size-6 text-neutral-300" />
                    No notices match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{row.title}</div>
                    <div className="mt-1 max-w-md truncate text-xs text-neutral-600">{row.body}</div>
                  </td>
                  <td className="px-4 py-3">
                    {row.imageUrl ? (
                      <div className="relative size-10 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                        <Image
                          src={row.imageUrl}
                          alt={row.imageAlt ?? ""}
                          fill
                          sizes="40px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={typeBadge(row.type)}>{row.type.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.startsAt || row.endsAt
                      ? `${toDateInput(row.startsAt) || "…"} → ${toDateInput(row.endsAt) || "…"}`
                      : "No dates"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadge(row.status)}>{row.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="inline-flex items-center gap-1">
                        <Button type="button" variant="ghost" size="xs" onClick={() => startEdit(row)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5 text-destructive" />
                          )}
                          Delete
                        </Button>
                      </div>
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
          Page {page} of {pageCount} · {total} notice{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/notices?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/notices?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>

      {dialog}
    </div>
  );
}
