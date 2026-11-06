"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Loader2,
  Search,
  ShieldAlert,
  ShieldX,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { VerificationCard } from "@/components/verify/VerificationCard";
import { certificateSearchFormSchema } from "@/lib/validators/certificates";
import {
  CERTIFICATE_NOT_FOUND_MESSAGE,
  tokenFromReference,
} from "@/lib/certificate-reference";
import { verifyCertificateAction } from "@/server/actions/verify";
import { cn } from "@/lib/utils";

/**
 * Public certificate search.
 *
 * The reference alone is only enough for a verification token. A printed certificate
 * number is sequential below its random suffix, so the form asks for the recipient's
 * full name beside it (docs 01 §S7) and Turnstile in front of it; pasted QR links are
 * handed straight to the token page, which shows the name unmasked.
 *
 * Results belong to this component rather than to the page's query string: the name
 * and the Turnstile token are a one-shot POST, and re-running either from a URL would
 * either leak them or re-burn the visitor's rate limit.
 */
export function VerifySearchForm({
  initialCertificateNumber = "",
  siteName,
}: {
  initialCertificateNumber?: string;
  siteName: string;
}) {
  const router = useRouter();
  const [code, setCode] = React.useState(initialCertificateNumber);
  const [recipientName, setRecipientName] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState("");
  const [errors, setErrors] = React.useState<{
    code?: string;
    recipientName?: string;
  }>({});
  const [result, setResult] = React.useState<
    Awaited<ReturnType<typeof verifyCertificateAction>> | null
  >(null);
  const [isChecking, setIsChecking] = React.useState(false);

  const trimmed = code.trim();
  const isToken = trimmed !== "" && tokenFromReference(trimmed) !== null;
  const asksForName = trimmed !== "" && !isToken;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setResult(null);

    const value = code.trim();
    if (!value) {
      setErrors({ code: "Enter the certificate number or verification code" });
      return;
    }

    // A token needs no second factor — the dedicated page renders it in full.
    const token = tokenFromReference(value);
    if (token) {
      router.push(`/verify/${encodeURIComponent(token)}`);
      return;
    }

    const parsed = certificateSearchFormSchema.safeParse({
      code: value,
      recipientName,
    });
    if (!parsed.success) {
      setErrors({
        code: parsed.error.issues.find((issue) => issue.path[0] === "code")?.message,
        recipientName: parsed.error.issues.find(
          (issue) => issue.path[0] === "recipientName"
        )?.message,
      });
      return;
    }

    setIsChecking(true);
    try {
      setResult(await verifyCertificateAction({ ...parsed.data, turnstileToken }));
    } finally {
      setIsChecking(false);
    }
  };

  const certificate = result?.ok ? result.certificate : null;

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={onSubmit}
        noValidate
        role="search"
        aria-label="Verify a certificate"
        className="flex w-full flex-col gap-3"
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            name="code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. DT-CERT-2026-00125-K7Q2 or verification code"
            aria-label="Certificate number or verification code"
            aria-invalid={Boolean(errors.code)}
            className={cn(
              "flex-1",
              errors.code && "border-destructive focus-visible:ring-destructive/30"
            )}
          />
          <Button
            type="submit"
            disabled={isChecking || !code.trim() || (!isToken && !turnstileToken)}
          >
            {isChecking ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Search aria-hidden="true" />
                Verify certificate
              </>
            )}
          </Button>
        </div>

        {errors.code && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.code}
          </p>
        )}

        {asksForName && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-recipient-name" className="flex items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5 text-neutral-500" />
              Recipient&rsquo;s full name
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="verify-recipient-name"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              name="recipientName"
              type="text"
              autoComplete="off"
              placeholder="Exactly as printed on the certificate"
              aria-invalid={Boolean(errors.recipientName)}
              className={cn(
                errors.recipientName &&
                  "border-destructive focus-visible:ring-destructive/30"
              )}
            />
            {errors.recipientName ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.recipientName}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-neutral-500">
                Type it exactly as printed on the certificate. Upper and lower case,
                double spaces and hyphens are ignored, but every word of the name has
                to be there — scanning the QR code is quicker if you are unsure.
              </p>
            )}
          </div>
        )}

        <TurnstileWidget onToken={setTurnstileToken} />
      </form>

      <div aria-live="polite" className="flex flex-col gap-5">
        {result && !result.ok && result.reason !== "not_found" && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {result.message}
          </p>
        )}

        {result && !result.ok && result.reason === "not_found" && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
            <ShieldX className="mx-auto size-8 text-destructive" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold text-neutral-900">
              No matching certificate found
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-neutral-600">
              {CERTIFICATE_NOT_FOUND_MESSAGE}
            </p>
            <p className="mx-auto mt-3 max-w-md break-all font-mono text-xs text-neutral-500">
              {code.trim()}
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
              {result?.ok && result.byToken
                ? "This certificate is listed in our official records."
                : "This certificate matches our records for the name you provided."}
            </p>
            {result?.ok && !result.byToken && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-500">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                The name is partly hidden on text searches. It appears in full when the
                QR code on the certificate is scanned.
              </p>
            )}
            <VerificationCard certificate={certificate} siteName={siteName} />
          </div>
        )}
      </div>
    </div>
  );
}
