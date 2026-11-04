import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";
import { Container } from "@/components/common/Container";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { DarbarTechLogo } from "@/components/common/DarbarTechLogo";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession } from "@/server/session";
import { can } from "@/server/permissions";
import type { Role } from "@/generated/prisma/client";
import { getSiteSettings } from "@/server/dal/settings";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Staff Login",
    path: "/techdarbar/login",
  }),
  robots: NOINDEX_METADATA,
};

export default async function AdminLoginPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  // A signed-in student must not be bounced into the dashboard (where the layout
  // would send them straight back) — show the form so they can switch to a staff account.
  if (role && can(role, "dashboard.view")) redirect("/techdarbar");

  const settings = await getSiteSettings();
  const { next } = await searchParams;
  // Only same-site admin paths — never an absolute URL (open-redirect).
  const nextPath =
    typeof next === "string" && /^\/techdarbar(?:\/|$)/.test(next) ? next : "/techdarbar";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-50 to-neutral-100 py-10">
      <Container size="sm">
        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-0.5">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <DarbarTechLogo
                size="md"
                logoUrl={settings.general.logoUrl}
                alt={settings.general.name}
              />
            </div>
            <h1 className="text-2xl font-semibold leading-none tracking-tight">Staff Login</h1>
            <CardDescription>
              Sign in to access the {settings.general.name} admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm nextPath={nextPath} />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}