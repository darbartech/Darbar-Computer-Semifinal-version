"use client";
import * as React from "react";
import { Printer, ShieldCheck, ShieldAlert, ShieldX, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import type { PublicVerifyView } from "@/server/types/certificates";

type Props = {
  certificate: PublicVerifyView;
  /** Live site name from settings, passed by the verifying page. */
  siteName?: string;
};

const STATUS_LABEL: Record<string, string> = {
  ISSUED: "VALID",
  REVOKED: "REVOKED",
  REISSUED: "REPLACED (REISSUED)",
  EXPIRED: "EXPIRED",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "accent" | "success" | "outline" | "destructive" | "warning"
> = {
  ISSUED: "success",
  REVOKED: "destructive",
  REISSUED: "warning",
  EXPIRED: "outline",
};

function formatNepaliDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    dateStyle: "long",
    timeZone: "Asia/Kathmandu",
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    dateStyle: "medium",
    timeZone: "Asia/Kathmandu",
  });
}

function InfoRow({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: "destructive" | "warning";
}) {
  const valueClass =
    accent === "destructive"
      ? "text-destructive"
      : accent === "warning"
        ? "text-warning-foreground"
        : muted
          ? "text-neutral-500"
          : "text-neutral-900";
  return (
    <div className="grid grid-cols-[130px,1fr] gap-2 border-b border-neutral-100 py-1.5 last:border-b-0 print:py-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className={`text-sm ${valueClass} print:text-neutral-800`}>{value}</span>
    </div>
  );
}

export function VerificationCard({ certificate, siteName = "our institute" }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const copyUrl = async () => {
    if (await copyText(certificate.verificationUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    }
    toast({
      title: "Could not copy",
      description: "The verification link could not be copied.",
      variant: "error",
    });
  };

  const statusLabel = STATUS_LABEL[certificate.status] ?? certificate.status;
  const statusVariant = STATUS_VARIANT[certificate.status] ?? "outline";

  const statusIcon =
    certificate.status === "ISSUED" ? (
      <ShieldCheck className="size-5 text-success" />
    ) : certificate.status === "REVOKED" ? (
      <ShieldAlert className="size-5 text-destructive" />
    ) : certificate.status === "REISSUED" ? (
      <ShieldAlert className="size-5 text-warning" />
    ) : (
      <ShieldX className="size-5 text-neutral-500" />
    );

  return (
    <div className="verify-root w-full">
      <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 print:max-w-none print:gap-0">
        {/* Screen-only action bar */}
        <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant} className="text-sm px-3 py-1">
              <span className="inline-flex items-center gap-1.5">
                {statusIcon}
                {statusLabel}
              </span>
            </Badge>
            <span className="font-mono text-xs text-neutral-500">
              {certificate.certificateNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" onClick={copyUrl}>
              {copied ? (
                <>
                  <Check className="size-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy link
                </>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        </div>

        {/* Printable certificate card */}
        <div className="verify-card relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm print:rounded-none print:border print:shadow-none">
          {/* Decorative header — print keeps it, screen keeps it subtle */}
          <div className="relative border-b border-neutral-200 bg-gradient-to-br from-primary/5 via-white to-accent/5 px-6 py-8 sm:px-10 sm:py-10 print:px-8 print:py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                </div>
                <div className="print:flex print:items-start print:justify-between print:w-full">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 print:text-[10px]">
                      Certificate of Completion
                    </p>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl print:text-3xl">
                      {certificate.courseName}
                    </h1>
                  </div>
                  <div className="mt-2 text-right font-mono text-xs text-neutral-500 print:mt-0 print:text-[11px]">
                    <div>No. {certificate.certificateNumber}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 print:grid-cols-2 print:gap-10 print:px-8 print:py-8">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 print:text-[10px]">
                Awarded to
              </p>
              <p className="text-xl font-semibold text-neutral-900 sm:text-2xl print:text-xl">
                {certificate.recipientName}
              </p>

              <div className="mt-4 flex flex-col gap-0 text-sm print:text-[13px]">
                <InfoRow label="Issue date" value={formatNepaliDate(certificate.issueDate)} />
                <InfoRow
                  label="Issued at"
                  value={formatShortDate(certificate.issuedAt)}
                  muted
                />
                {certificate.revokedAt && (
                  <InfoRow
                    label="Revoked at"
                    value={formatNepaliDate(certificate.revokedAt)}
                    accent="destructive"
                  />
                )}
                {certificate.reissuedAt && (
                  <InfoRow
                    label="Replaced at"
                    value={formatNepaliDate(certificate.reissuedAt)}
                    accent="warning"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 print:text-[10px]">
                  Modules covered
                </p>
                {certificate.items.length === 0 ? (
                  <p className="text-xs text-neutral-400 print:text-[11px]">
                    No modules listed
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 print:rounded-none">
                    {certificate.items.map((item) => (
                      <li
                        key={`${item.order}-${item.title}`}
                        className="flex items-start justify-between gap-3 p-3 print:p-2"
                      >
                        <div>
                          <p className="font-medium text-neutral-900 print:text-[13px]">
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="text-xs text-neutral-500 print:text-[11px]">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 print:text-[10px]">
                  Signed by
                </p>
                {certificate.issuedSignatories.length === 0 ? (
                  <p className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-400 print:text-[11px]">
                    No signatories recorded on this record.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 print:rounded-none">
                    {certificate.issuedSignatories.map((sig, idx) => (
                      <li key={`${sig.name}-${idx}`} className="p-3 print:p-2">
                        <p className="font-medium text-neutral-900 print:text-[13px]">
                          {sig.name}
                        </p>
                        <p className="text-xs text-neutral-500 print:text-[11px]">
                          {sig.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Footer: verification URL */}
          <div className="border-t border-neutral-200 bg-neutral-50/60 px-6 py-4 sm:px-10 print:bg-white print:px-8 print:py-3">
            <div className="flex flex-col gap-1 text-xs text-neutral-500 print:flex-row print:items-center print:justify-between print:text-[10px]">
              <div>
                <span className="font-semibold text-neutral-600">Verify at:</span>{" "}
                <span className="break-all">{certificate.verificationUrl}</span>
              </div>
              <div className="print:text-right">
                Generated from {siteName} official records
              </div>
            </div>
          </div>

          {/* Revoke notice banner (shown on screen, kept off the printed record) */}
          {(certificate.status === "REVOKED" ||
            certificate.status === "REISSUED" ||
            certificate.status === "EXPIRED") && (
            <div className="print:hidden border-t border-destructive/20 bg-destructive/5 px-6 py-4 sm:px-10">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="text-sm text-destructive-foreground">
                  <p className="font-semibold">
                    {certificate.status === "REVOKED"
                      ? "This certificate has been revoked."
                      : certificate.status === "REISSUED"
                        ? "This certificate has been replaced by a newer reissued copy."
                        : "This certificate has expired."}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    It remains on file for audit, but is no longer considered a valid credential.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
