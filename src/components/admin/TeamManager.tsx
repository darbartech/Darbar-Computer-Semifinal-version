"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveTeamMember, deleteTeamMemberAction } from "@/server/actions/team";
import {
  teamMemberWriteSchema,
  type TeamMemberWriteInput,
  type TeamMemberWriteValues,
} from "@/lib/validators/team";

type TeamMemberRow = {
  id: string;
  name: string;
  role: string;
  specialty: string | null;
  bio: string | null;
  photo: { id: string; url: string } | null;
  photoId: string | null;
  sortOrder: number;
  isPublished: boolean;
};

type Props = {
  rows: TeamMemberRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: { q: string; isPublished: string };
  library: LibraryImage[];
  canWrite: boolean;
  /** Hard delete is a SUPER_ADMIN action (docs/08): the row has no archive flag. */
  canDelete: boolean;
};

type Editing = TeamMemberWriteInput & { id: string };

const EMPTY: Editing = {
  id: "",
  name: "",
  role: "",
  specialty: "",
  bio: "",
  photoId: "",
  sortOrder: 0,
  isPublished: false,
};

export function TeamManager({
  rows,
  total,
  page,
  pageCount,
  filters,
  library,
  canWrite,
  canDelete,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { ask, dialog } = useConfirm();
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
  } = useForm<TeamMemberWriteInput, unknown, TeamMemberWriteValues>({
    resolver: zodResolver(teamMemberWriteSchema),
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
    router.replace(`/techdarbar/team?${params.toString()}`, { scroll: false });
  };

  const startCreate = () => {
    setEditing({ ...EMPTY });
    reset({ ...EMPTY });
    setPhoto(null);
  };

  const startEdit = (row: TeamMemberRow) => {
    const next: Editing = {
      id: row.id,
      name: row.name,
      role: row.role,
      specialty: row.specialty ?? "",
      bio: row.bio ?? "",
      photoId: row.photoId ?? "",
      sortOrder: row.sortOrder,
      isPublished: row.isPublished,
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

  const onSubmit = async (values: TeamMemberWriteValues) => {
    const result = await saveTeamMember(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof TeamMemberWriteInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: values.id ? "Team member updated" : "Team member created", variant: "success" });
    setEditing(null);
    reset(EMPTY);
    setPhoto(null);
    router.refresh();
  };

  const handleDelete = async (row: TeamMemberRow) => {
    await ask({
      title: "Delete team member?",
      description: (
        <>
          <span className="font-medium text-neutral-900">{row.name}</span> will be removed from
          the About page and the instructor listings. This cannot be undone.
        </>
      ),
      run: async () => {
        setDeletingId(row.id);
        const result = await deleteTeamMemberAction(row.id);
        setDeletingId(null);
        if (!result.ok) return result.error;
        toast({ title: "Team member deleted", variant: "success" });
        router.refresh();
        return null;
      },
    });
  };

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
              {editing.id ? "Edit team member" : "New team member"}
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
              <Input {...register("name")} placeholder="Full name" />
              {errors.name?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Role / Title *</Label>
              <Input {...register("role")} placeholder="e.g. Lead Instructor" />
              {errors.role?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.role.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Specialty</Label>
              <Input {...register("specialty")} placeholder="e.g. Web Development" />
              {errors.specialty?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.specialty.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Sort order</Label>
              <Input type="number" min={0} {...register("sortOrder")} />
              {errors.sortOrder?.message && (
                <p className="mt-1 text-xs font-medium text-destructive">{errors.sortOrder.message}</p>
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
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Bio</Label>
            <Textarea rows={4} {...register("bio")} placeholder="Short biography…" />
            {errors.bio?.message && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors.bio.message}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6">
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
              {editing.id ? "Save changes" : "Create team member"}
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
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="tm-q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="tm-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search by name…"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-56">
            <Label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="tm-status">
              Status
            </Label>
            <Select
              id="tm-status"
              value={filters.isPublished}
              onChange={(event) => applyFilters({ isPublished: event.target.value })}
              options={statusOptions}
            />
          </div>

          {canWrite && !editing && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New team member
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
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Specialty</th>
                <th className="px-4 py-3 font-semibold">Photo</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-neutral-500">
                    No team members match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{row.name}</div>
                    {row.bio && (
                      <div className="mt-1 max-w-md truncate text-xs text-neutral-600">
                        {row.bio}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.role}</td>
                  <td className="px-4 py-3 text-neutral-700">{row.specialty ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.photo ? (
                      <div className="flex items-center gap-2">
                        <img
                        src={row.photo.url}
                        alt=""
                        className="size-8 rounded-full object-cover"
                      />
                        <Badge variant="outline">Yes</Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-neutral-200" />
                      <Badge variant="outline">None</Badge>
                    </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.sortOrder}</td>
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
                        {canDelete && (
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
                        )}
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
          Page {page} of {pageCount} · {total} team member{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/team?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/team?${params.toString()}`, { scroll: false });
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
