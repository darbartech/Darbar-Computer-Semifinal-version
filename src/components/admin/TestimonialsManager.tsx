"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveTestimonial, deleteTestimonialAction } from "@/server/actions/testimonials";
import {
  testimonialWriteSchema,
  type TestimonialWriteInput,
  type TestimonialWriteValues,
} from "@/lib/validators/testimonials";

type TestimonialRow = {
  id: string;
  name: string;
  course: { id: string; title: string } | null;
  courseLabel: string | null;
  quote: string;
  rating: number;
  photo: { id: string; url: string } | null;
  photoId: string | null;
  consentGiven: boolean;
  consentNote: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string | Date;
};

type Props = {
  rows: TestimonialRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; isPublished: string };
  courseOptions: SelectOption[];
  library: LibraryImage[];
  canWrite: boolean;
};

type Editing = TestimonialWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  name: "",
  courseId: "",
  courseLabel: "",
  quote: "",
  rating: 5,
  photoId: "",
  consentGiven: true,
  consentNote: "",
  isPublished: false,
  sortOrder: 0,
};

export function TestimonialsManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  courseOptions,
  library,
  canWrite,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<PickedImage>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TestimonialWriteInput, unknown, TestimonialWriteValues>({
    resolver: zodResolver(testimonialWriteSchema),
    defaultValues: EMPTY,
  });

  const applyFilters = (next: Partial<typeof filters>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...filters, ...next };
    if (merged.q) params.set("q", merged.q);
    else params.delete("q");
    if (merged.isPublished) params.set("isPublished", merged.isPublished);
    else params.delete("isPublished");
    params.delete("page");
    router.replace(`/techdarbar/testimonials?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    setEditing({ ...EMPTY });
    reset({ ...EMPTY });
    setPhoto(null);
  };

  const startEdit = (row: TestimonialRow) => {
    const next: Editing = {
      id: row.id,
      name: row.name,
      courseId: row.course?.id ?? "",
      courseLabel: row.courseLabel ?? "",
      quote: row.quote,
      rating: row.rating,
      photoId: row.photoId ?? "",
      consentGiven: row.consentGiven,
      consentNote: row.consentNote ?? "",
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
    };
    setEditing(next);
    reset(next);
    setPhoto(
      row.photo && row.photoId
        ? { id: row.photoId, url: row.photo.url, alt: row.name }
        : null
    );
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onSubmit = async (values: TestimonialWriteValues) => {
    const result = await saveTestimonial(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof TestimonialWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: values.id ? "Testimonial updated" : "Testimonial created", variant: "success" });
    setEditing(null);
    reset(EMPTY);
    setPhoto(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this testimonial? This cannot be undone.")) return;
    setDeletingId(id);
    const result = await deleteTestimonialAction(id);
    setDeletingId(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "Testimonial deleted", variant: "success" });
    router.refresh();
  };

  const ratingOptions: SelectOption[] = [
    { value: "1", label: "1 Star" },
    { value: "2", label: "2 Stars" },
    { value: "3", label: "3 Stars" },
    { value: "4", label: "4 Stars" },
    { value: "5", label: "5 Stars" },
  ];

  const statusOptions: SelectOption[] = [
    { value: "", label: "All statuses" },
    { value: "true", label: "Published" },
    { value: "false", label: "Draft" },
  ];

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
              {editing.id ? "Edit testimonial" : "New testimonial"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setEditing(null);
                reset(EMPTY);
                setPhoto(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Name *</Label>
              <Input {...register("name")} placeholder="Student name" />
              {errors.name?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Course (linked)</Label>
              <Select
                {...register("courseId")}
                options={[{ value: "", label: "— No linked course —" }, ...courseOptions]}
              />
              {errors.courseId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.courseId.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Course label (free text)</Label>
              <Input {...register("courseLabel")} placeholder="e.g. Advanced Web Dev Batch 2025" />
              {errors.courseLabel?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.courseLabel.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Rating</Label>
              <Select {...register("rating")} options={ratingOptions} />
              {errors.rating?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.rating.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <ImagePicker
                label="Photo"
                value={photo}
                onChange={(next) => {
                  setPhoto(next);
                  setValue("photoId", next?.id ?? "", { shouldDirty: true });
                }}
                library={library}
                hint="Upload a new photo or choose one from the media library."
                disabled={!canWrite}
              />
              {errors.photoId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.photoId.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Quote *</Label>
            <Textarea rows={4} {...register("quote")} placeholder="What did the student say?" />
            {errors.quote?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.quote.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Consent note</Label>
              <Input {...register("consentNote")} placeholder="Verbal consent via phone 2025-01-15" />
              {errors.consentNote?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.consentNote.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Sort order</Label>
              <Input type="number" min={0} {...register("sortOrder")} />
              {errors.sortOrder?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.sortOrder.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                {...register("consentGiven")}
              />
              Consent given
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                {...register("isPublished")}
              />
              Published
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing.id ? "Save changes" : "Create testimonial"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                reset(EMPTY);
                setPhoto(null);
              }}
            >
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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="t-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="t-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search by name…"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-56">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="t-status">
              Status
            </Label>
            <Select
              id="t-status"
              value={filters.isPublished}
              onChange={(event) => applyFilters({ isPublished: event.target.value })}
              options={statusOptions}
            />
          </div>

          {canWrite && !editing && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New testimonial
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Rating</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Consent</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-neutral-500">
                    No testimonials match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{row.name}</div>
                    <div className="mt-1 max-w-md truncate text-xs text-neutral-600">
                      {row.quote}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.course?.title ?? row.courseLabel ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: row.rating }).map((_, i) => (
                        <Star key={i} className="size-4 fill-current" />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.sortOrder}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.consentGiven ? "success" : "warning"}>
                      {row.consentGiven ? "Given" : "Pending"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.isPublished ? "success" : "outline"}>
                      {row.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDelete(row.id)}
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
          Page {page} of {pageCount} · {total} testimonial{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/testimonials?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/testimonials?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
