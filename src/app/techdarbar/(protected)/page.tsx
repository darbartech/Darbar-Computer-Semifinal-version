import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { requireUser } from "@/server/session";
import {
  UsersRound,
  BookOpen,
  Settings as SettingsIcon,
  ShieldUser,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { can } from "@/server/permissions";
import { AccountantHome } from "@/components/admin/fees/AccountantHome";
import type { Role } from "@/generated/prisma/client";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Dashboard",
    path: "/techdarbar",
  }),
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminDashboardPage() {
  const user = await requireUser();
  const role = user.role as Role;

  const canViewLeads = can(role, "lead.read");
  const canViewCourses = can(role, "course.read");
  const canViewSettings = can(role, "settings.read");
  const canViewUsers = can(role, "user.manage");
  const canViewFees = can(role, "fee.read");

  // Docs 08 §2: one URL, a different home screen per role. The accountant opens on
  // the money that needs chasing, not on a grid of shortcuts.
  if (role === "ACCOUNTANT") return <AccountantHome name={user.name} />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="text-sm text-neutral-600">
          Welcome back, {user.name}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canViewLeads && (
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Leads</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UsersRound className="size-5" />
                </div>
              </div>
              <CardDescription>
                Manage admissions, enquiries and follow-ups.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link href="/techdarbar/leads" className="w-full">
                <Button variant="outline" className="w-full group">
                  Open Leads
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {canViewCourses && (
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Courses</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <BookOpen className="size-5" />
                </div>
              </div>
              <CardDescription>
                Course catalog, categories and batches.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link href="/techdarbar/courses" className="w-full">
                <Button variant="outline" className="w-full group">
                  Open Courses
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {canViewFees && (
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Fees</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Wallet className="size-5" />
                </div>
              </div>
              <CardDescription>
                Invoices, dues and the receipts taken at the counter.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link href="/techdarbar/fees" className="w-full">
                <Button variant="outline" className="w-full group">
                  Open Fees
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {canViewSettings && (
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Settings</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                  <SettingsIcon className="size-5" />
                </div>
              </div>
              <CardDescription>
                Site settings, content and preferences.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link href="/techdarbar/settings" className="w-full">
                <Button variant="outline" className="w-full group">
                  Open Settings
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {canViewUsers && (
          <Card className="hover:-translate-y-1 hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Users</CardTitle>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldUser className="size-5" />
                </div>
              </div>
              <CardDescription>
                Create staff accounts, assign roles and manage access.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link href="/techdarbar/users" className="w-full">
                <Button variant="outline" className="w-full group">
                  Manage Users
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick links</CardTitle>
          <CardDescription>Shortcuts to frequently used admin modules.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {canViewLeads && (
              <Link href="/techdarbar/leads">
                <Button variant="secondary" size="sm">Leads</Button>
              </Link>
            )}
            {canViewCourses && (
              <Link href="/techdarbar/courses">
                <Button variant="secondary" size="sm">Courses</Button>
              </Link>
            )}
            {canViewFees && (
              <Link href="/techdarbar/fees">
                <Button variant="secondary" size="sm">Fees</Button>
              </Link>
            )}
            {canViewSettings && (
              <Link href="/techdarbar/settings">
                <Button variant="secondary" size="sm">Settings</Button>
              </Link>
            )}
            {canViewUsers && (
              <Link href="/techdarbar/users">
                <Button variant="secondary" size="sm">Users</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
