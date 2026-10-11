import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Shield, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { UsersTable } from "@/components/admin/UsersTable";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListUsers } from "@/server/dal/users";
import { userFilterSchema } from "@/lib/validators/users";

export const metadata: Metadata = {
  title: "Users",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("users.read");

  if (user.role !== "SUPER_ADMIN") {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/admin" }, { label: "Users" }]}
        />
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-10 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-8 text-destructive" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Access restricted</h1>
          <p className="mb-6 max-w-md text-sm text-neutral-600">
            This area is reserved for super administrators only. Role management and user
            auditing require the highest permission level.
          </p>
          <Link href="/admin" className={buttonVariants()}>
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = userFilterSchema.parse(raw);

  const result = await adminListUsers(filters);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Users" }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            <Shield className="size-6 text-primary" />
            Users
          </h1>
          <p className="text-sm text-neutral-600">
            {result.total} user{result.total === 1 ? "" : "s"} in this view. Create staff
            accounts, assign roles and manage access. Every change is logged to the audit
            trail, and you cannot change your own role or deactivate yourself.
          </p>
        </div>
      </div>

      <UsersTable
        rows={result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          isActive: row.isActive,
          emailVerified: row.emailVerified,
          lastLoginAt: row.lastLoginAt,
          createdAt: row.createdAt,
        }))}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          role: filters.role ?? "",
          isActive: filters.isActive ?? "",
          page: filters.page,
        }}
        currentUserId={user.id}
        canWrite={can(user.role, "users.write")}
      />
    </div>
  );
}
