"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  CheckCircle2,
  FilterX,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Shield,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  USER_PASSWORD_MIN,
  USER_ROLE_OPTIONS,
  userCreateSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserCreateValues,
  type UserFilters,
  type UserUpdateInput,
  type UserUpdateValues,
} from "@/lib/validators/users";
import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/server/actions/users";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ROLE_VARIANT: Record<Role, "default" | "accent" | "success" | "warning"> = {
  SUPER_ADMIN: "default",
  ADMIN: "accent",
  EDITOR: "success",
  COUNSELOR: "warning",
  STUDENT: "default",
};

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean | Date | string | null;
  lastLoginAt: string | Date | null;
  createdAt: string | Date;
};

type Props = {
  rows: UserRow[];
  total: number;
  page: number;
  pageCount: number;
  filters: UserFilters;
  currentUserId: string;
  canWrite: boolean;
};

const EMPTY_CREATE: UserCreateInput = {
  name: "",
  email: "",
  role: "EDITOR",
  password: "",
  isActive: true,
};

const EMPTY_EDIT: UserUpdateInput = {
  id: "",
  name: "",
  email: "",
  role: "EDITOR",
  isActive: true,
};

type Panel =
  | { mode: "create" }
  | { mode: "edit"; id: string }
  | null;

export function UsersTable({ rows, total, page, pageCount, filters, currentUserId, canWrite }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [panel, setPanel] = React.useState<Panel>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetError, setResetError] = React.useState<string | null>(null);
  const [resetBusy, setResetBusy] = React.useState(false);

  const createForm = useForm<UserCreateInput, unknown, UserCreateValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: EMPTY_CREATE,
  });

  const editForm = useForm<UserUpdateInput, unknown, UserUpdateValues>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: EMPTY_EDIT,
  });

  const applyFilters = React.useCallback(
    (next: Partial<UserFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      if (merged.q) params.set("q", merged.q);
      else params.delete("q");
      if (merged.role) params.set("role", merged.role);
      else params.delete("role");
      if (merged.isActive) params.set("isActive", merged.isActive);
      else params.delete("isActive");
      params.delete("page");

      router.replace(`/techdarbar/users?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  const closePanel = () => {
    setPanel(null);
    createForm.reset(EMPTY_CREATE);
    editForm.reset(EMPTY_EDIT);
  };

  const startCreate = () => {
    setResetting(null);
    createForm.reset(EMPTY_CREATE);
    setPanel({ mode: "create" });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (row: UserRow) => {
    setResetting(null);
    editForm.reset({
      id: row.id,
      name: row.name ?? "",
      email: row.email,
      role: row.role,
      isActive: row.isActive,
    });
    setPanel({ mode: "edit", id: row.id });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmitCreate = async (values: UserCreateValues) => {
    const result = await createUserAction(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) createForm.setError(field as keyof UserCreateInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "User created", description: values.email, variant: "success" });
    closePanel();
    router.refresh();
  };

  const onSubmitEdit = async (values: UserUpdateValues) => {
    const result = await updateUserAction(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) editForm.setError(field as keyof UserUpdateInput, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "User updated", variant: "success" });
    closePanel();
    router.refresh();
  };

  const handleToggleActive = async (row: UserRow) => {
    const next = !row.isActive;
    if (!next && !confirm(`Deactivate ${row.email}? They will be signed out immediately.`)) return;
    setBusyId(row.id);
    const result = await setUserActiveAction({ id: row.id, isActive: next });
    setBusyId(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: next ? "User activated" : "User deactivated", variant: "success" });
    router.refresh();
  };

  const handleDelete = async (row: UserRow) => {
    if (!confirm(`Delete ${row.email}? This permanently removes the account and its sessions.`)) return;
    setBusyId(row.id);
    const result = await deleteUserAction({ id: row.id });
    setBusyId(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "User deleted", variant: "success" });
    if (panel?.mode === "edit" && panel.id === row.id) closePanel();
    router.refresh();
  };

  const startReset = (row: UserRow) => {
    closePanel();
    setResetPassword("");
    setResetError(null);
    setResetting(row);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitReset = async () => {
    if (!resetting) return;
    if (resetPassword.length < USER_PASSWORD_MIN) {
      setResetError(`Password must be at least ${USER_PASSWORD_MIN} characters`);
      return;
    }
    setResetBusy(true);
    const result = await resetUserPasswordAction({ id: resetting.id, password: resetPassword });
    setResetBusy(false);
    if (!result.ok) {
      const fieldMessage = result.fieldErrors?.password?.[0];
      setResetError(fieldMessage ?? result.error);
      return;
    }
    toast({ title: "Password reset", description: resetting.email, variant: "success" });
    setResetting(null);
    setResetPassword("");
  };

  const hasFilters = !!(filters.q || filters.role || filters.isActive);
  const isSelf = (id: string) => id === currentUserId;
  const editingSelf = panel?.mode === "edit" && panel.id === currentUserId;

  const renderFieldError = (message?: string) =>
    message ? <p className="mt-1 text-xs font-medium text-destructive">{message}</p> : null;

  return (
    <div className="flex flex-col gap-4">
      {canWrite && panel?.mode === "create" && (
        <form
          onSubmit={createForm.handleSubmit(onSubmitCreate)}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">New user</h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={closePanel}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Name *</Label>
              <Input {...createForm.register("name")} placeholder="Full name" autoComplete="off" />
              {renderFieldError(createForm.formState.errors.name?.message)}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Email *</Label>
              <Input
                type="email"
                {...createForm.register("email")}
                placeholder="name@darbar.com.np"
                autoComplete="off"
              />
              {renderFieldError(createForm.formState.errors.email?.message)}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Role *</Label>
              <Select
                {...createForm.register("role")}
                options={USER_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
              {renderFieldError(createForm.formState.errors.role?.message)}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">
                Temporary password *
              </Label>
              <Input
                type="password"
                {...createForm.register("password")}
                placeholder={`At least ${USER_PASSWORD_MIN} characters`}
                autoComplete="new-password"
              />
              {renderFieldError(createForm.formState.errors.password?.message)}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              {...createForm.register("isActive")}
            />
            Active — can sign in immediately
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={createForm.formState.isSubmitting}>
              {createForm.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create user
            </Button>
            <Button type="button" variant="ghost" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {canWrite && panel?.mode === "edit" && (
        <form
          onSubmit={editForm.handleSubmit(onSubmitEdit)}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">
              Edit user
              {editingSelf && (
                <span className="ml-2 font-normal text-neutral-500">
                  (your own account)
                </span>
              )}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={closePanel}>
              <X className="size-4" />
            </Button>
          </div>

          <input type="hidden" {...editForm.register("id")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Name *</Label>
              <Input {...editForm.register("name")} placeholder="Full name" />
              {renderFieldError(editForm.formState.errors.name?.message)}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Email *</Label>
              <Input type="email" {...editForm.register("email")} placeholder="name@darbar.com.np" />
              {renderFieldError(editForm.formState.errors.email?.message)}
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-neutral-800">Role *</Label>
              <Select
                {...editForm.register("role")}
                disabled={editingSelf}
                options={USER_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
              {editingSelf && (
                <p className="mt-1 text-xs text-neutral-500">You cannot change your own role.</p>
              )}
              {renderFieldError(editForm.formState.errors.role?.message)}
            </div>
          </div>

          <label
            className={cn(
              "flex items-center gap-2 text-sm text-neutral-800",
              editingSelf && "opacity-60"
            )}
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              disabled={editingSelf}
              {...editForm.register("isActive")}
            />
            Active
            {editingSelf && (
              <span className="text-xs text-neutral-500">You cannot deactivate your own account.</span>
            )}
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={editForm.formState.isSubmitting}>
              {editForm.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save changes
            </Button>
            <Button type="button" variant="ghost" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {canWrite && resetting && (
        <div className="flex flex-col gap-4 rounded-xl border border-warning/30 bg-warning/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <KeyRound className="size-4" />
              Reset password for {resetting.email}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setResetting(null);
                setResetPassword("");
                setResetError(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="max-w-md">
            <Label className="mb-1.5 block text-sm font-medium text-neutral-800">New password *</Label>
            <Input
              type="password"
              value={resetPassword}
              onChange={(event) => {
                setResetPassword(event.target.value);
                setResetError(null);
              }}
              placeholder={`At least ${USER_PASSWORD_MIN} characters`}
              autoComplete="new-password"
            />
            {renderFieldError(resetError ?? undefined)}
            <p className="mt-1 text-xs text-neutral-500">
              The user will be signed out of all sessions and must use the new password.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={submitReset} disabled={resetBusy}>
              {resetBusy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Set password
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setResetting(null);
                setResetPassword("");
                setResetError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
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
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="usr-q">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="usr-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Name or email"
                className="pl-10"
              />
            </div>
          </form>

          <div className="lg:w-48">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="usr-role">
              Role
            </label>
            <Select
              id="usr-role"
              value={filters.role ?? ""}
              onChange={(event) => applyFilters({ role: event.target.value as UserFilters["role"] })}
              options={[
                { value: "", label: "All roles" },
                ...USER_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
          </div>

          <div className="lg:w-44">
            <label className="mb-1 block text-xs font-semibold text-neutral-600" htmlFor="usr-status">
              Status
            </label>
            <Select
              id="usr-status"
              value={filters.isActive ?? ""}
              onChange={(event) =>
                applyFilters({ isActive: event.target.value as UserFilters["isActive"] })
              }
              options={[
                { value: "", label: "All statuses" },
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => applyFilters({ q: "", role: undefined, isActive: undefined })}
            >
              <FilterX className="size-4" />
              Clear
            </Button>
          )}

          {canWrite && (
            <Button type="button" onClick={startCreate} className="h-11">
              <Plus className="size-4" />
              New user
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Verified</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-neutral-500">
                    <Shield className="mx-auto mb-2 size-8 text-neutral-300" />
                    No users match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const busy = busyId === row.id;
                const self = isSelf(row.id);
                return (
                  <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-800">{row.name ?? "—"}</span>
                        {self && (
                          <Badge variant="accent" className="px-1.5 py-0 text-[10px]">
                            You
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{row.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_VARIANT[row.role]}>{row.role.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.isActive ? "success" : "destructive"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {row.emailVerified ? (
                        <div className="flex items-center gap-1.5 text-success">
                          <CheckCircle2 className="size-4" />
                          <span className="text-xs font-medium">Yes</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-neutral-500">
                          <XCircle className="size-4" />
                          <span className="text-xs font-medium">No</span>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {formatDate(row.lastLoginAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Edit"
                            aria-label={`Edit ${row.email}`}
                            disabled={busy}
                            onClick={() => startEdit(row)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={row.isActive ? "Deactivate" : "Activate"}
                            aria-label={row.isActive ? `Deactivate ${row.email}` : `Activate ${row.email}`}
                            disabled={busy || (self && row.isActive)}
                            onClick={() => handleToggleActive(row)}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : row.isActive ? (
                              <PowerOff className="size-4 text-warning" />
                            ) : (
                              <Power className="size-4 text-success" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Reset password"
                            aria-label={`Reset password for ${row.email}`}
                            disabled={busy}
                            onClick={() => startReset(row)}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Delete"
                            aria-label={`Delete ${row.email}`}
                            disabled={busy || self}
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs italic text-neutral-400">Read only</span>
                      )}
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
          Page {page} of {pageCount} · {total} user{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(page - 1));
              router.replace(`/techdarbar/users?${params.toString()}`, { scroll: false });
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
              router.replace(`/techdarbar/users?${params.toString()}`, { scroll: false });
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
