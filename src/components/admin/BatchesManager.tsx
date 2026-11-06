"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { deleteBatchAction, saveBatch } from "@/server/actions/batches";
import {
  BATCH_STATUSES,
  BATCH_WRITE_STATUSES,
  TIME_SLOTS,
  batchWriteSchema,
  type BatchWriteInput,
  type BatchWriteValues,
} from "@/lib/validators/batch";
import type { AdminBatchView } from "@/server/dal/batches";

type Props = {
  rows: AdminBatchView[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; courseId: string; status: string };
  courseOptions: SelectOption[];
  instructorOptions: SelectOption[];
  canWrite: boolean;
};

type Editing = BatchWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  courseId: "",
  name: "",
  startDate: "",
  timeSlot: "MORNING",
  seatsTotal: 20,
  status: "UPCOMING",
  instructorId: "",
};

/** `FULL` is derived from the seats, so it is never a choice in the form. */
const WRITABLE_STATUS_OPTIONS: SelectOption[] = BATCH_WRITE_STATUSES.map((value) => ({
  value,
  label: value[0] + value.slice(1).toLowerCase(),
}));

const ALL_STATUS_OPTIONS: SelectOption[] = [
  { value: "", label: "All statuses" },
  ...BATCH_STATUSES.map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })),
];

const TIME_SLOT_OPTIONS: SelectOption[] = TIME_SLOTS.map((value) => ({
  value,
  label: value[0] + value.slice(1).toLowerCase(),
}));

const statusBadge = (status: string): "success" | "warning" | "destructive" | "outline" =>
  status === "CANCELLED"
    ? "destructive"
    : status === "COMPLETED"
      ? "outline"
      : status === "RUNNING" || status === "OPEN"
        ? "success"
        : "warning";

export function BatchesManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  courseOptions,
  instructorOptions,
  canWrite,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BatchWriteInput, unknown, BatchWriteValues>({
    resolver: zodResolver(batchWriteSchema),
    defaultValues: EMPTY,
  });

  const instructorId = watch("instructorId");

  const closeForm = () => {
    setEditing(null);
    reset(EMPTY);
  };

  const applyFilters = (next: Partial<typeof filters>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...filters, ...next };
    for (const key of ["q", "courseId", "status"] as const) {
      if (merged[key]) params.set(key, merged[key]);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`/techdarbar/batches?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    const next: Editing = { ...EMPTY, courseId: filters.courseId };
    setEditing(next);
    reset(next);
  };

  const startEdit = (row: AdminBatchView) => {
    const next: Editing = {
      id: row.id,
      courseId: row.courseId,
      name: row.name,
      startDate: row.startDate,
      timeSlot: row.timeSlot as (typeof TIME_SLOTS)[number],
      seatsTotal: row.seatsTotal,
      status: row.status as (typeof BATCH_WRITE_STATUSES)[number],
      instructorId: row.instructorId ?? "",
    };
    setEditing(next);
    reset(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (values: BatchWriteValues) => {
    const result = await saveBatch(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof BatchWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: values.id ? "Batch updated" : "Batch created", variant: "success" });
    closeForm();
    router.refresh();
  };

  const handleDelete = async (row: AdminBatchView) => {
    await ask({
      title: "Delete batch?",
      description: (
        <>
          <span className="font-medium text-neutral-900">{row.name}</span> is deleted with its
          timetable entries. A batch that still has enrolled students is refused by the server;
          moving those students out first is the way to get here.
        </>
      ),
      run: async () => {
        setDeletingId(row.id);
        const result = await deleteBatchAction(row.id);
        setDeletingId(null);
        if (!result.ok) return result.error;
        toast({ title: "Batch deleted", variant: "success" });
        router.refresh();
        return null;
      },
    });
  };

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
              {editing.id ? "Edit batch" : "New batch"}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={closeForm}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Course *</Label>
              <Select
                {...register("courseId")}
                options={[{ value: "", label: "Choose a course…" }, ...courseOptions]}
              />
              {errors.courseId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.courseId.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Batch name *</Label>
              <Input {...register("name")} placeholder="e.g. Web Development — Nov 2026" />
              {errors.name?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Start date *</Label>
              <Input type="date" {...register("startDate")} />
              {errors.startDate?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.startDate.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Time slot</Label>
              <Select {...register("timeSlot")} options={TIME_SLOT_OPTIONS} />
              {errors.timeSlot?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.timeSlot.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Seats *</Label>
              <Input type="number" min={0} {...register("seatsTotal")} />
              {errors.seatsTotal?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.seatsTotal.message}</p>
              )}
              {editing.id && (
                <p className="mt-1 text-xs text-neutral-600">
                  {rows.find((row) => row.id === editing.id)?.seatsTaken ?? 0} already taken —
                  approved students hold them.
                </p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Status</Label>
              <Select {...register("status")} options={WRITABLE_STATUS_OPTIONS} />
              {errors.status?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.status.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">
                Instructor of record
              </Label>
              <Select
                {...register("instructorId")}
                options={[{ value: "", label: "Not assigned yet" }, ...instructorOptions]}
              />
              {errors.instructorId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {errors.instructorId.message}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-600">
                {instructorId
                  ? "That teacher sees this batch, its roster and its submissions — and nothing outside it."
                  : "Until someone is chosen, no instructor can see this batch or its students."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing.id ? "Save changes" : "Create batch"}
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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="b-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="b-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search by batch name…"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-56">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="b-course">
              Course
            </Label>
            <Select
              id="b-course"
              value={filters.courseId}
              onChange={(event) => applyFilters({ courseId: event.target.value })}
              options={[{ value: "", label: "All courses" }, ...courseOptions]}
            />
          </div>

          <div className="lg:w-40">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="b-status">
              Status
            </Label>
            <Select
              id="b-status"
              value={filters.status}
              onChange={(event) => applyFilters({ status: event.target.value })}
              options={ALL_STATUS_OPTIONS}
            />
          </div>

          {canWrite && !editing && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New batch
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Batch</th>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Starts</th>
                <th className="px-4 py-3 font-semibold">Instructor</th>
                <th className="px-4 py-3 font-semibold">Seats</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                {canWrite && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className="px-4 py-16 text-center text-neutral-500">
                    {canWrite
                      ? "No batches match these filters."
                      : "None of your batches match these filters."}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-neutral-900">
                      <CalendarDays className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                      {row.name}
                    </span>
                    <span className="ml-6 block text-xs text-neutral-500">
                      {row.timeSlot.toLowerCase()} slot
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.courseTitle}</td>
                  <td className="px-4 py-3 text-neutral-700">{row.startDate}</td>
                  <td className="px-4 py-3">
                    {row.instructorName ? (
                      <span className="inline-flex items-center gap-1.5 text-neutral-800">
                        <Users className="size-4 text-neutral-400" aria-hidden="true" />
                        {row.instructorName}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.seatsTaken}/{row.seatsTotal}
                    <span className="ml-1.5 text-xs text-neutral-500">
                      {row.seatsLeft === 0 ? "full" : `${row.seatsLeft} free`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadge(row.status)}>{row.status.toLowerCase()}</Badge>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Page {page} of {pageCount} · {total} batch{total === 1 ? "" : "es"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/batches?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/batches?${params.toString()}`, { scroll: false });
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
