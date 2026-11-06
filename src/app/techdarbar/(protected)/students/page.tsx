import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import {
  countStudentsByStatus,
  listStudentsForAdmin,
} from "@/server/dal/students";
import { seesStudentPii } from "@/server/dal/scope";
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
  const user = await requirePermission("student.read");

  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "ALL";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";

  const scope = { userId: user.id, role: user.role };
  const canReview = can(user.role, "student.approve");
  const seesPii = seesStudentPii(user.role);
  const [studentList, counts] = await Promise.all([
    listStudentsForAdmin({ status, query: q || undefined }, scope),
    countStudentsByStatus(scope),
  ]);
  const students = studentList.rows;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "Students" }]} />

      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <GraduationCap className="size-6 text-primary" />
          Students
        </h1>
        <p className="text-sm text-neutral-600">
          {canReview
            ? "Approve or reject student registrations. Portal features stay locked until approval."
            : "Your batches only: the students you teach, with their contact details left to the office."}
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
                      : "/techdarbar/students"
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
        <form className="relative w-full sm:w-72" action="/techdarbar/students">
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={seesPii ? "Search name, email or student code" : "Search name or student code"}
            className="pl-9"
          />
        </form>
      </div>

      {studentList.truncated && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          This view has more than {students.length} students, so the list stops here. Narrow it
          with a status or a search before you act on it.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              {seesPii && <th className="px-4 py-3 font-semibold">Phone</th>}
              <th className="px-4 py-3 font-semibold">Registered</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={seesPii ? 6 : 5} className="px-4 py-10 text-center text-neutral-500">
                  {seesPii
                    ? "No students match this view."
                    : "No student in your batches has registered yet."}
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{student.name}</p>
                    {student.email && (
                      <p className="text-xs text-neutral-500">{student.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                    {student.studentCode}
                  </td>
                  {seesPii && (
                    <td className="px-4 py-3 text-neutral-600">
                      {student.phone ?? "—"}
                      {student.city && (
                        <span className="block text-xs text-neutral-400">{student.city}</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-neutral-600">{formatDate(student.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[student.approvalStatus] ?? "outline"}>
                      {student.approvalStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/techdarbar/students/${student.id}`}>
                      <Button size="sm" variant="outline">
                        {canReview ? "Review" : "Open"}
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
