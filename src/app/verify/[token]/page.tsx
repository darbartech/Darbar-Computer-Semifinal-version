import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award } from "lucide-react";
import { Container } from "@/components/common/Container";
import { VerificationCard } from "@/components/verify/VerificationCard";
import { getPublicCertificateByToken } from "@/server/dal/certificates";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";
import { verifyTokenSchema } from "@/lib/validators/certificates";

export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token: rawToken } = await params;
  const settings = await getSiteSettings();

  const parsed = verifyTokenSchema.safeParse(rawToken);
  if (!parsed.success) {
    return buildMetadata(
      {
        title: "Certificate",
        description: "Certificate verification",
        path: `/verify/${rawToken}`,
        robots: NOINDEX_METADATA,
      },
      settings
    );
  }

  const cert = await getPublicCertificateByToken(parsed.data);
  if (!cert) {
    return buildMetadata(
      {
        title: "Certificate",
        description: "Certificate verification",
        path: `/verify/${rawToken}`,
        robots: NOINDEX_METADATA,
      },
      settings
    );
  }

  return buildMetadata(
    {
      title: `${cert.recipientName} — ${cert.courseName}`,
      description: `Certificate ${cert.certificateNumber} verification record for ${cert.courseName}.`,
      path: `/verify/${rawToken}`,
      robots: NOINDEX_METADATA,
    },
    settings
  );
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const settings = await getSiteSettings();

  const parsed = verifyTokenSchema.safeParse(rawToken);
  if (!parsed.success) {
    notFound();
  }

  const certificate = await getPublicCertificateByToken(parsed.data);
  if (!certificate) {
    notFound();
  }

  return (
    <Container className="py-10 sm:py-14 print:py-0">
      <div className="mb-8 print:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </div>

      <div className="mb-8 flex items-start gap-3 print:hidden">
        <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
          <Award className="size-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Certificate verification
          </h1>
          <p className="text-sm text-neutral-600">
            Official record issued by {settings.general.name}.
          </p>
        </div>
      </div>

      <VerificationCard certificate={certificate} siteName={settings.general.name} />
    </Container>
  );
}
