import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/session";
import {
  countStudentsByStatus,
  listStudentsForAdmin,
} from "@/server/dal/students";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Students",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "destructive" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("student.read");

  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "ALL";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";

  const [students, counts] = await Promise.all([
    listStudentsForAdmin({ status, query: q || undefined }),
    countStudentsByStatus(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Students" }]} />

      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <GraduationCap className="size-6 text-primary" />
          Students
        </h1>
        <p className="text-sm text-neutral-600">
          Approve or reject student registrations. Portal features stay locked until approval.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => {
            const active = status === filter.value;
            const count = counts[filter.value] ?? 0;
            return (
              <Link
                key={filter.value}
                href={
                  filter.value === "ALL"
                    ? q
                      ? `?q=${encodeURIComponent(q)}`
                      : "/admin/students"
                    : `?status=${filter.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`
                }
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")
                }
              >
                {filter.label}
                <span className="text-neutral-400">{count}</span>
              </Link>
            );
          })}
        </div>
        <form className="relative w-full sm:w-72" action="/admin/students">
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name, email or student code"
            className="pl-9"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Registered</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  No students match this view.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{student.name}</p>
                    <p className="text-xs text-neutral-500">{student.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                    {student.studentCode}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {student.phone ?? "—"}
                    {student.city && (
                      <span className="block text-xs text-neutral-400">{student.city}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(student.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[student.approvalStatus] ?? "outline"}>
                      {student.approvalStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/students/${student.id}`}>
                      <Button size="sm" variant="outline">
                        Review
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
