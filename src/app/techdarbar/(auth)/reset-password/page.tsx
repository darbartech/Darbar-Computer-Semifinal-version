import type { Metadata } from "next";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";
import { Container } from "@/components/common/Container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { DarbarTechLogo } from "@/components/common/DarbarTechLogo";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import { getSiteSettings } from "@/server/dal/settings";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Choose a new staff password",
    path: "/techdarbar/reset-password",
  }),
  robots: NOINDEX_METADATA,
};

export default async function AdminResetPasswordPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ token, error }, settings] = await Promise.all([
    searchParams,
    getSiteSettings(),
  ]);
  const invalidLink = error === "INVALID_TOKEN";

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
            <h1 className="text-2xl font-semibold leading-none tracking-tight">
              New password
            </h1>
            <CardDescription>
              Signing a staff account back in revokes its other sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invalidLink ? (
              <div
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                role="alert"
              >
                This reset link is invalid or has expired. Please request a new one.
              </div>
            ) : null}
            <ResetPasswordForm
              portal="staff"
              token={token ?? ""}
              loginHref="/techdarbar/login"
              loginLabel="Back to staff login"
            />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
