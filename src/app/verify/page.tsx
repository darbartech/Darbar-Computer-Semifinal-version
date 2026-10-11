import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, QrCode, ShieldQuestion, ShieldX } from "lucide-react";
import { Container } from "@/components/common/Container";
import { VerificationCard } from "@/components/verify/VerificationCard";
import { VerifySearchForm } from "@/components/verify/VerifySearchForm";
import { VerifyQrScanner } from "@/components/verify/VerifyQrScanner";
import { getPublicCertificateByQuery } from "@/server/dal/certificates";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";
import { certificateLookupSchema } from "@/lib/validators/certificates";
import type { PublicVerifyView } from "@/server/types/certificates";

export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildMetadata(
    {
      title: "Verify a certificate",
      description:
        "Check the authenticity of our certificate by scanning its QR code or searching the certificate number, student ID, or verification code.",
      path: "/verify",
      robots: { index: false, follow: false },
    },
    settings
  );
}

/** Extracts the verification token from a pasted QR URL (e.g. https://…/verify/<token>). */
function tokenFromUrl(value: string): string {
  const match = value.replace(/\s+/g, "").match(/verify\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/);
  return match ? match[1] : value;
}

export default async function VerifySearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const settings = await getSiteSettings();
  const rawCode = typeof sp.code === "string" ? sp.code.trim() : "";

  let certificate: PublicVerifyView | null = null;
  let lookedUp = false;
  let invalid = false;

  if (rawCode) {
    const parsed = certificateLookupSchema.safeParse({ code: rawCode });
    if (!parsed.success) {
      invalid = true;
    } else {
      lookedUp = true;
      certificate = await getPublicCertificateByQuery(
        tokenFromUrl(parsed.data.code)
      );
    }
  }

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
            Scan the QR code printed on the certificate, or search by its
            certificate number, student ID, or verification code. We&rsquo;ll
            match it against our official records.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <VerifySearchForm initialValue={rawCode} />
          {invalid && (
            <p
              role="alert"
              className="mt-3 text-sm font-medium text-destructive"
            >
              That doesn&rsquo;t look like a certificate number, student ID, or
              verification code. Check the entry and try again.
            </p>
          )}
        </div>

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
              of the QR code into the search box above — it&rsquo;s extracted
              and verified automatically.
            </p>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-6">
          {lookedUp && !invalid && !certificate && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <ShieldX className="mx-auto size-8 text-destructive" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-neutral-900">
                No matching certificate found
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-neutral-600">
                We could not find a public certificate record for{" "}
                <span className="font-mono text-neutral-800">{rawCode}</span>.
                Double-check the certificate number, student ID, or verification
                code for typos. If this looks wrong to you, please contact our
                office and quote the exact reference.
              </p>
              <Link
                href="/contact"
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
              >
                Contact us for help
              </Link>
            </div>
          )}

          {certificate && (
            <div className="flex flex-col gap-4">
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success">
                <BadgeCheck className="size-4" aria-hidden="true" />
                This certificate is listed in our official records.
              </p>
              <VerificationCard certificate={certificate} siteName={settings.general.name} />
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}