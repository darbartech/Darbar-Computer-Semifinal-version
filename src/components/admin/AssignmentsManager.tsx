"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ClipboardList,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { deleteAssignmentAction, listCourseStudentsAction, saveAssignmentAction } from "@/server/actions/assignments";
import {
  ASSIGNMENT_STATUSES,
  assignmentWriteSchema,
  type AssignmentWriteInput,
  type AssignmentWriteValues,
} from "@/lib/validators/assignments";

type AssignmentRow = {
  id: string;
  title: string;
  instructions: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  studentIds: string[];
  recipientCount: number;
  submissionCount: number;
};

type CourseStudent = {
  id: string;
  name: string;
  studentCode: string;
  approvalStatus: string;
};

type Props = {
  rows: AssignmentRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; courseId: string; status: string };
  courseOptions: SelectOption[];
  canWrite: boolean;
};

type Editing = AssignmentWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  courseId: "",
  title: "",
  instructions: "",
  dueDate: "",
  status: "DRAFT",
  studentIds: [],
};

/** `YYYY-MM-DD` for the date input; the DB stores the full UTC instant. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const statusBadge = (status: string) =>
  status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "outline" : "warning";

export function AssignmentsManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  courseOptions,
  canWrite,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<CourseStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState(false);
  // Remembers which course the loaded list belongs to, so switching courses
  // clears the ticked students but opening the edit form keeps them.
  const loadedCourseId = React.useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AssignmentWriteInput, unknown, AssignmentWriteValues>({
    resolver: zodResolver(assignmentWriteSchema),
    defaultValues: EMPTY,
  });

  const courseId = watch("courseId");
  const selectedIds = watch("studentIds");

  React.useEffect(() => {
    if (!editing) {
      loadedCourseId.current = null;
      setStudents([]);
      return;
    }
    if (!courseId) {
      loadedCourseId.current = null;
      setStudents([]);
      return;
    }
    if (loadedCourseId.current === courseId) return;

    // A course switch invalidates the previous tick list; loading the list for an
    // already-chosen course must keep what the instructor ticked.
    if (loadedCourseId.current !== null) setValue("studentIds", []);
    loadedCourseId.current = courseId;

    let cancelled = false;
    setLoadingStudents(true);
    void listCourseStudentsAction(courseId).then((result) => {
      if (cancelled) return;
      setLoadingStudents(false);
      if (!result.ok) {
        setStudents([]);
        toast({ title: result.error, variant: "error" });
        return;
      }
      setStudents(result.data.students);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, editing, setValue, toast]);

  const toggleStudent = (studentId: string, checked: boolean) => {
    const current = selectedIds ?? [];
    const next = checked ? [...current, studentId] : current.filter((id) => id !== studentId);
    setValue("studentIds", [...new Set(next)], { shouldValidate: true, shouldDirty: true });
  };

  const selectAllStudents = (checked: boolean) => {
    setValue("studentIds", checked ? students.map((student) => student.id) : [], {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

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
    router.replace(`/techdarbar/assignments?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    // Default to the course currently filtered, which is how these forms are
    // usually opened right after narrowing the list to one course.
    const next: Editing = { ...EMPTY, courseId: filters.courseId };
    setEditing(next);
    reset(next);
  };

  const startEdit = (row: AssignmentRow) => {
    const next: Editing = {
      id: row.id,
      courseId: row.courseId,
      title: row.title,
      instructions: row.instructions ?? "",
      dueDate: toDateInput(row.dueDate),
      status: row.status as (typeof ASSIGNMENT_STATUSES)[number],
      studentIds: row.studentIds,
    };
    setEditing(next);
    reset(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (values: AssignmentWriteValues) => {
    const result = await saveAssignmentAction(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof AssignmentWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: values.id ? "Assignment updated" : "Assignment created", variant: "success" });
    closeForm();
    router.refresh();
  };

  const handleDelete = async (row: AssignmentRow) => {
    await ask({
      title: "Delete assignment?",
      description: (
        <>
          <span className="font-medium text-neutral-900">{row.title}</span> and every student
          link for it are deleted, including the submissions students filed against it. Set it
          to DRAFT instead if the work is only being retimed.
        </>
      ),
      run: async () => {
        setDeletingId(row.id);
        const result = await deleteAssignmentAction(row.id);
        setDeletingId(null);
        if (!result.ok) return result.error;
        toast({ title: "Assignment deleted", variant: "success" });
        router.refresh();
        return null;
      },
    });
  };

  const statusFilterOptions: SelectOption[] = [
    { value: "", label: "All statuses" },
    ...ASSIGNMENT_STATUSES.map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })),
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
              {editing.id ? "Edit assignment" : "New assignment"}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={closeForm}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Course *</Label>
              <Select {...register("courseId")} options={[{ value: "", label: "Choose a course…" }, ...courseOptions]} />
              {errors.courseId?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.courseId.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Title *</Label>
              <Input {...register("title")} placeholder="e.g. Build a responsive landing page" />
              {errors.title?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Due date</Label>
              <Input type="date" {...register("dueDate")} />
              {errors.dueDate?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.dueDate.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Status</Label>
              <Select {...register("status")} options={statusFilterOptions.filter((o) => o.value !== "")} />
              {errors.status?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.status.message}</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label className="text-sm font-medium text-neutral-800">
                Students in this course *
              </Label>
              {students.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectAllStudents((selectedIds?.length ?? 0) < students.length)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {(selectedIds?.length ?? 0) === students.length ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            {!courseId ? (
              <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600">
                Choose a course first — the picker lists its enrolled students.
              </p>
            ) : loadingStudents ? (
              <p className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-600">
                <Loader2 className="size-4 animate-spin" />
                Loading students…
              </p>
            ) : students.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600">
                Nobody is enrolled in this course yet. Enrol the student under Students first.
              </p>
            ) : (
              <div className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
                {students.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-[var(--primary)]"
                      checked={(selectedIds ?? []).includes(student.id)}
                      onChange={(event) => toggleStudent(student.id, event.target.checked)}
                    />
                    <span className="flex-1 truncate text-neutral-900">{student.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{student.studentCode}</span>
                    {student.approvalStatus !== "APPROVED" && (
                      <Badge variant="warning">{student.approvalStatus.toLowerCase()}</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}

            {errors.studentIds?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.studentIds.message}</p>
            )}
            {!errors.studentIds?.message && (
              <p className="mt-1 text-xs text-neutral-600">
                {selectedIds?.length ?? 0} selected — only they get this task.
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Instructions</Label>
            <Textarea
              rows={4}
              {...register("instructions")}
              placeholder="What the student should build, and what the link should point to."
            />
            {errors.instructions?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.instructions.message}</p>
            )}
          </div>

          <p className="text-xs text-neutral-600">
            Only the students you tick see this task, and they answer with one link.
            A DRAFT assignment stays hidden from the portal.
          </p>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing.id ? "Save changes" : "Create assignment"}
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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="a-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="a-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search by title…"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-56">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="a-course">
              Course
            </Label>
            <Select
              id="a-course"
              value={filters.courseId}
              onChange={(event) => applyFilters({ courseId: event.target.value })}
              options={[{ value: "", label: "All courses" }, ...courseOptions]}
            />
          </div>

          <div className="lg:w-40">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="a-status">
              Status
            </Label>
            <Select
              id="a-status"
              value={filters.status}
              onChange={(event) => applyFilters({ status: event.target.value })}
              options={statusFilterOptions}
            />
          </div>

          {canWrite && !editing && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New assignment
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-neutral-500">
                    No assignments match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/techdarbar/assignments/${row.id}`}
                      className="font-medium text-neutral-900 hover:text-primary"
                    >
                      {row.title}
                    </Link>
                    {row.instructions && (
                      <div className="mt-1 max-w-md truncate text-xs text-neutral-600">
                        {row.instructions}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.courseTitle}</td>
                  <td className="px-4 py-3 text-neutral-700">{toDateInput(row.dueDate) || "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/techdarbar/assignments/${row.id}`}
                      className="inline-flex items-center gap-1 text-neutral-700 hover:text-primary"
                    >
                      <ClipboardList className="size-4" />
                      {row.submissionCount}/{row.recipientCount}
                      <ExternalLink className="size-3.5 text-neutral-400" />
                    </Link>
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
          Page {page} of {pageCount} · {total} assignment{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/assignments?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/assignments?${params.toString()}`, { scroll: false });
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
