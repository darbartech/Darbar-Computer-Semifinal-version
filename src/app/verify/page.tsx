import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QrCode, ShieldQuestion } from "lucide-react";
import { Container } from "@/components/common/Container";
import { VerifySearchForm } from "@/components/verify/VerifySearchForm";
import { VerifyQrScanner } from "@/components/verify/VerifyQrScanner";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";
import { tokenFromReference } from "@/lib/certificate-reference";

export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildMetadata(
    {
      title: "Verify a certificate",
      description:
        "Check the authenticity of our certificate by scanning its QR code, or search with the certificate number together with the recipient's name.",
      path: "/verify",
      robots: NOINDEX_METADATA,
    },
    settings
  );
}

export default async function VerifySearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const settings = await getSiteSettings();
  const rawCode = typeof sp.code === "string" ? sp.code.trim() : "";

  // Old deep links and scanned QR codes arrive as `?code=<token>`. The token is the
  // whole proof, so hand it to the page built for it — which shows the recipient name
  // in full — instead of looking it up here (docs 01 §S7 step 1).
  const token = rawCode ? tokenFromReference(rawCode) : null;
  if (token) redirect(`/verify/${encodeURIComponent(token)}`);

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <ShieldQuestion className="size-10" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Verify a certificate
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-neutral-600">
            Scan the QR code printed on the certificate — it is the quickest check
            and shows the recipient&rsquo;s name in full. Otherwise search with the
            certificate number and the name exactly as it is printed.
          </p>
        </div>

        {/* First, because it needs no typing and cannot mistype a name (reaudit N11). */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-neutral-900">
              Verify by QR code
            </h2>
          </div>
          <VerifyQrScanner />
          <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
            <p className="text-xs leading-relaxed text-neutral-600">
              No camera? Paste the full verification link from the certificate
              QR code into the search box below — it&rsquo;s recognised and
              verified automatically, with the name shown in full. Searching by
              certificate number alone is answered with a masked name, because a
              number by itself is not enough to prove ownership.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">
            Or search by certificate number
          </h2>
          <VerifySearchForm
            initialCertificateNumber={rawCode}
            siteName={settings.general.name}
          />
        </div>
      </div>
    </Container>
  );
}
