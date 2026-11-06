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
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { getSiteSettings } from "@/server/dal/settings";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Reset staff password",
    path: "/techdarbar/forgot-password",
  }),
  robots: NOINDEX_METADATA,
};

export default async function AdminForgotPasswordPage() {
  const settings = await getSiteSettings();

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
              Reset your password
            </h1>
            <CardDescription>
              We will email {settings.general.name} staff a link to choose a new
              one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm
              portal="staff"
              backHref="/techdarbar/login"
              backLabel="Back to staff login"
            />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
