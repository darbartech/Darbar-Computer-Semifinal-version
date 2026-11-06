"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
  ShieldCheck,
  ShieldOff,
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
  TWO_FACTOR_REQUIRED_ROLES,
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
  EMPTY_STEP_UP,
  isStepUpComplete,
  StepUpFields,
  stepUpPayload,
  type StepUpValue,
} from "@/components/admin/StepUpFields";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/server/actions/users";
import { resetUserTwoFactorAction } from "@/server/actions/two-factor";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ROLE_VARIANT: Record<Role, "default" | "accent" | "success" | "warning"> = {
  SUPER_ADMIN: "default",
  ADMIN: "accent",
  EDITOR: "success",
  COUNSELOR: "warning",
  INSTRUCTOR: "success",
  ACCOUNTANT: "accent",
  RECEPTION: "warning",
  STUDENT: "default",
};

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean | Date | string | null;
  twoFactorEnabled: boolean;
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

/**
 * The row buttons that change what an account can do, or hand it back to its
 * owner, answered with a code (task 2). Every one of them goes through
 * `requireStepUp` server-side, so the dialog is the only way to submit them.
 */
type StepUpAsk = {
  kind: "delete" | "two-factor" | "password" | "activate" | "deactivate";
  row: UserRow;
};

const STEP_UP_ASK_COPY: Record<
  StepUpAsk["kind"],
  {
    title: string;
    description: (email: string) => string;
    confirm: string;
    variant: "destructive" | "default";
    done: string;
  }
> = {
  delete: {
    title: "Delete this account",
    description: (email) =>
      `${email} is removed with their sessions and password. Invoices, receipts and audit entries they touched stay in the ledger.`,
    confirm: "Delete user",
    variant: "destructive",
    done: "User deleted",
  },
  "two-factor": {
    title: "Reset their two-factor",
    description: (email) =>
      `${email} loses the enrolled authenticator and its backup codes, is signed out everywhere, and must set one up again on next sign-in.`,
    confirm: "Reset two-factor",
    variant: "destructive",
    done: "Two-factor reset",
  },
  password: {
    title: "Send a reset link",
    description: (email) =>
      `${email} is sent a one-time link to their own address, valid for 30 minutes, and sets a new password themselves. Their live sessions close as soon as the link goes — you no longer choose their password.`,
    confirm: "Send reset link",
    variant: "default",
    done: "Reset link sent",
  },
  deactivate: {
    title: "Deactivate this account",
    description: (email) =>
      `${email} is signed out immediately and cannot sign back in until the status is turned on again.`,
    confirm: "Deactivate user",
    variant: "destructive",
    done: "User deactivated",
  },
  activate: {
    title: "Activate this account",
    description: (email) =>
      `${email} can sign in again, with whatever role and permissions the account holds.`,
    confirm: "Activate user",
    variant: "default",
    done: "User activated",
  },
} as const;

/** A staff role whose creation has to be confirmed with a code. */
const isPrivilegedRole = (role: Role) => TWO_FACTOR_REQUIRED_ROLES.includes(role);

export function UsersTable({ rows, total, page, pageCount, filters, currentUserId, canWrite }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [panel, setPanel] = React.useState<Panel>(null);
  const [stepUpAsk, setStepUpAsk] = React.useState<StepUpAsk | null>(null);
  const [stepUpAskError, setStepUpAskError] = React.useState<string | null>(null);
  const [stepUpAskBusy, setStepUpAskBusy] = React.useState(false);
  const [editOriginal, setEditOriginal] = React.useState<{ email: string; role: Role } | null>(
    null
  );
  const [editStepUp, setEditStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [editStepUpError, setEditStepUpError] = React.useState<string | null>(null);
  const [createStepUp, setCreateStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [createStepUpError, setCreateStepUpError] = React.useState<string | null>(null);

  const createForm = useForm<UserCreateInput, unknown, UserCreateValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: EMPTY_CREATE,
  });

  const editForm = useForm<UserUpdateInput, unknown, UserUpdateValues>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: EMPTY_EDIT,
  });

  // What the edit panel holds, against what the row was when it was opened: a code
  // is asked for when the role or the address moves, not for a typo in a name.
  const editEmail = useWatch({ control: editForm.control, name: "email" });
  const editRole = useWatch({ control: editForm.control, name: "role" });
  const editIdentityMoved =
    editOriginal !== null &&
    (editEmail !== editOriginal.email || editRole !== editOriginal.role);

  // And what the create panel is about to make: four of the seven roles can move
  // money, so hiring one of them is confirmed the same way as editing into it.
  const createRole = useWatch({ control: createForm.control, name: "role" });
  const createNeedsCode = isPrivilegedRole(createRole);

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
    setEditOriginal(null);
    setEditStepUp(EMPTY_STEP_UP);
    setEditStepUpError(null);
    setCreateStepUp(EMPTY_STEP_UP);
    setCreateStepUpError(null);
    createForm.reset(EMPTY_CREATE);
    editForm.reset(EMPTY_EDIT);
  };

  const startCreate = () => {
    setStepUpAsk(null);
    createForm.reset(EMPTY_CREATE);
    setCreateStepUp(EMPTY_STEP_UP);
    setCreateStepUpError(null);
    setPanel({ mode: "create" });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (row: UserRow) => {
    setStepUpAsk(null);
    editForm.reset({
      id: row.id,
      name: row.name ?? "",
      email: row.email,
      role: row.role,
      isActive: row.isActive,
    });
    setEditOriginal({ email: row.email, role: row.role });
    setEditStepUp(EMPTY_STEP_UP);
    setEditStepUpError(null);
    setPanel({ mode: "edit", id: row.id });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmitCreate = async (values: UserCreateValues) => {
    const needsCode = isPrivilegedRole(values.role);
    const result = await createUserAction(
      needsCode ? { ...values, ...stepUpPayload(createStepUp) } : values
    );
    // Spent or refused, the 30-second window has passed; a retry types fresh digits.
    if (needsCode) setCreateStepUp(EMPTY_STEP_UP);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) createForm.setError(field as keyof UserCreateInput, { message: messages[0] });
      }
      setCreateStepUpError(needsCode && !result.fieldErrors ? result.error : null);
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "User created", description: values.email, variant: "success" });
    closePanel();
    router.refresh();
  };

  const onSubmitEdit = async (values: UserUpdateValues) => {
    const needsCode = editIdentityMoved;
    const result = await updateUserAction(
      needsCode ? { ...values, ...stepUpPayload(editStepUp) } : values
    );
    // The code window closed either way: a retry needs the digits valid now.
    if (needsCode) setEditStepUp(EMPTY_STEP_UP);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) editForm.setError(field as keyof UserUpdateInput, { message: messages[0] });
      }
      setEditStepUpError(needsCode && !result.fieldErrors ? result.error : null);
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "User updated", variant: "success" });
    closePanel();
    router.refresh();
  };

  /**
   * Every row button that changes what an account can do is answered with a code,
   * so the click that hands over, disarms, disables or removes an account is made
   * by whoever holds the phone, not by whoever has an open tab. The dialog
   * collects the proof; the action below spends it.
   */
  const askStepUp = (kind: StepUpAsk["kind"], row: UserRow) => {
    setStepUpAskError(null);
    setStepUpAsk({ kind, row });
  };

  const closeStepUpAsk = () => {
    if (stepUpAskBusy) return;
    setStepUpAsk(null);
    setStepUpAskError(null);
  };

  const submitStepUpAsk = async (payload: ReturnType<typeof stepUpPayload>) => {
    if (!stepUpAsk) return;
    const { kind, row } = stepUpAsk;
    setStepUpAskBusy(true);
    setStepUpAskError(null);
    const result =
      kind === "delete"
        ? await deleteUserAction({ id: row.id, ...payload })
        : kind === "two-factor"
          ? await resetUserTwoFactorAction({ id: row.id, ...payload })
          : kind === "password"
            ? await resetUserPasswordAction({ id: row.id, ...payload })
            : await setUserActiveAction({
                id: row.id,
                isActive: kind === "activate",
                ...payload,
              });
    setStepUpAskBusy(false);
    if (!result.ok) {
      // Read the refusal at the box it was typed into; a wrong digit is retyped,
      // not re-found in a toast that already faded.
      setStepUpAskError(result.error);
      return;
    }
    setStepUpAsk(null);
    toast({
      title: STEP_UP_ASK_COPY[kind].done,
      description: kind === "delete" ? undefined : row.email,
      variant: "success",
    });
    // An open edit panel on that row now holds a stale status, or a row that no
    // longer exists.
    if (
      panel?.mode === "edit" &&
      panel.id === row.id &&
      kind !== "password" &&
      kind !== "two-factor"
    ) {
      closePanel();
    }
    router.refresh();
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

          {createNeedsCode && (
            <div className="max-w-md rounded-lg border border-primary/30 bg-white p-4">
              <p className="mb-2.5 text-sm font-medium text-neutral-900">
                {createRole} can take money or issue certificates. Creating the account is
                confirmed with your own code.
              </p>
              <StepUpFields
                value={createStepUp}
                onChange={(next) => {
                  setCreateStepUp(next);
                  setCreateStepUpError(null);
                }}
                error={createStepUpError}
                disabled={createForm.formState.isSubmitting}
                idPrefix="create"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={createForm.formState.isSubmitting || (createNeedsCode && !isStepUpComplete(createStepUp))}
            >
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

          {editIdentityMoved && (
            <div className="max-w-md rounded-lg border border-primary/30 bg-white p-4">
              <p className="mb-2.5 text-sm font-medium text-neutral-900">
                {editRole !== editOriginal?.role && editEmail !== editOriginal?.email
                  ? "This changes their role and where their sign-in arrives."
                  : editRole !== editOriginal?.role
                    ? "A new role inherits a new set of permissions."
                    : "A new email is where this account signs in and gets password resets."}
              </p>
              <StepUpFields
                value={editStepUp}
                onChange={(next) => {
                  setEditStepUp(next);
                  setEditStepUpError(null);
                }}
                error={editStepUpError}
                disabled={editForm.formState.isSubmitting}
                idPrefix="edit"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={
                editForm.formState.isSubmitting ||
                (editIdentityMoved && !isStepUpComplete(editStepUp))
              }
            >
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
                <th className="px-4 py-3 font-semibold">Two-factor</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-neutral-500">
                    <Shield className="mx-auto mb-2 size-8 text-neutral-300" />
                    No users match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
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
                    <td className="px-4 py-3">
                      {row.twoFactorEnabled ? (
                        <div className="flex items-center gap-1.5 text-success">
                          <ShieldCheck className="size-4" />
                          <span className="text-xs font-medium">On</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-warning">
                          <ShieldOff className="size-4" />
                          <span className="text-xs font-medium">Off</span>
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
                            disabled={self && row.isActive}
                            onClick={() => askStepUp(row.isActive ? "deactivate" : "activate", row)}
                          >
                            {row.isActive ? (
                              <PowerOff className="size-4 text-warning" />
                            ) : (
                              <Power className="size-4 text-success" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Send a password-reset link"
                            aria-label={`Send a password-reset link to ${row.email}`}
                            onClick={() => askStepUp("password", row)}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          {row.twoFactorEnabled && !self && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="Reset two-factor"
                              aria-label={`Reset two-factor for ${row.email}`}
                              onClick={() => askStepUp("two-factor", row)}
                            >
                              <ShieldOff className="size-4 text-warning" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Delete"
                            aria-label={`Delete ${row.email}`}
                            disabled={self}
                            onClick={() => askStepUp("delete", row)}
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
      <StepUpDialog
        open={stepUpAsk !== null}
        title={stepUpAsk ? STEP_UP_ASK_COPY[stepUpAsk.kind].title : ""}
        description={
          stepUpAsk ? STEP_UP_ASK_COPY[stepUpAsk.kind].description(stepUpAsk.row.email) : ""
        }
        confirmLabel={stepUpAsk ? STEP_UP_ASK_COPY[stepUpAsk.kind].confirm : ""}
        variant={stepUpAsk ? STEP_UP_ASK_COPY[stepUpAsk.kind].variant : "destructive"}
        pending={stepUpAskBusy}
        error={stepUpAskError}
        onCancel={closeStepUpAsk}
        onConfirm={submitStepUpAsk}
      />
    </div>
  );
}
