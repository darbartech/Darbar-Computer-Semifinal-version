"use client";
import * as React from "react";
import { Check, Copy, ExternalLink, Fingerprint, History, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { fmtDate } from "@/lib/dates";
import type { AdminCertificateDetail } from "@/server/types/certificates";
import { revokeCategoryLabel } from "@/server/types/certificates";

type Props = {
  certificate: AdminCertificateDetail;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return fmtDate(iso, { dateStyle: "long" });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    toast({
      title: "Could not copy",
      description: `${label} could not be copied.`,
      variant: "error",
    });
  };

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={onCopy}
      title={`Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="text-neutral-500 hover:text-neutral-900"
    >
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
    </Button>
  );
}

/**
 * Read-only management view for issued/reissued/revoked records. Issued certificates
 * are immutable as-signed, so instead of the editable draft form we surface the
 * document identity, the public verification link, and the lifecycle timeline.
 */
const subscribeToOrigin = () => () => {};
let hydratedOrigin = "";
const readOrigin = () => {
  if (!hydratedOrigin && typeof window !== "undefined") {
    hydratedOrigin = window.location.origin;
  }
  return hydratedOrigin;
};
const readOriginServer = () => "";

/**
 * Same-site origin for the shareable verification link. Reading `window` during
 * SSR or in the initial render produces text that mismatches the server's HTML
 * and fails hydration, so the snapshot-based API keeps the relative path while
 * rendering server-side and upgrades to the absolute origin after mount.
 */
function useClientOrigin(): string {
  return React.useSyncExternalStore(subscribeToOrigin, readOrigin, readOriginServer);
}

export function CertificateImmutableOverview({ certificate }: Props) {
  const origin = useClientOrigin();

  const verifyUrl = origin
    ? `${origin}/verify/${certificate.verificationToken}`
    : `/verify/${certificate.verificationToken}`;

  const events: Array<{
    label: string;
    time: string;
    detail?: string | null;
    tone?: "normal" | "warning" | "destructive";
  }> = [];

  if (certificate.createdAt) events.push({ label: "Created", time: formatDate(certificate.createdAt) });
  if (certificate.issuedAt) events.push({ label: "Issued", time: formatDate(certificate.issuedAt) });
  if (certificate.revokedAt)
    events.push({
      label: "Revoked",
      time: formatDate(certificate.revokedAt),
      detail: [
        revokeCategoryLabel(certificate.revokeCategory) &&
          `Category: ${revokeCategoryLabel(certificate.revokeCategory)}`,
        certificate.revokeReason && `Reason: ${certificate.revokeReason}`,
      ]
        .filter(Boolean)
        .join(" — "),
      tone: "destructive",
    });
  if (certificate.reissuedAt)
    events.push({
      label: "Reissued",
      time: formatDate(certificate.reissuedAt),
      detail: certificate.reissueReason,
      tone: "warning",
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Fingerprint className="size-4 text-primary" />
            Permanent record
          </h3>
          <p className="text-xs text-neutral-500">
            Issued certificates are immutable. Corrections are made by revoking and
            reissuing — the original stays preserved for audit.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {certificate.certificateNumber && (
              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-mono text-xs text-neutral-800">
                {certificate.certificateNumber}
                <CopyButton value={certificate.certificateNumber} label="Certificate number" />
              </span>
            )}
          </div>

          {certificate.verificationToken && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Public verification link
              </span>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-700">
                  {verifyUrl}
                </code>
                <div className="flex items-center gap-1">
                  <CopyButton value={verifyUrl} label="Verification link" />
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Open
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                Anyone holding this link can confirm the document is genuine on the
                public verify page.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <History className="size-4 text-primary" />
          Lifecycle
        </h3>
        <ol className="mt-4 flex flex-col gap-0">
          {events.map((event, index) => (
            <li key={event.label} className="relative flex gap-3 pb-5 last:pb-0">
              {index < events.length - 1 && (
                <span className="absolute left-[5px] top-3 h-full w-px bg-neutral-200" aria-hidden />
              )}
              <span
                className={`relative mt-1.5 size-2.5 shrink-0 rounded-full border border-neutral-300 ${
                  event.tone === "destructive"
                    ? "bg-destructive"
                    : event.tone === "warning"
                      ? "bg-warning"
                      : "bg-primary"
                }`}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{event.label}</span>
                  <span className="text-xs text-neutral-500">{event.time}</span>
                </div>
                {event.detail && (
                  <p className="text-xs text-neutral-500">{event.detail}</p>
                )}
              </div>
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-sm text-neutral-500">No lifecycle events recorded.</li>
          )}
        </ol>
      </div>

      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-neutral-700">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          The certificate number, verification link, signatories and module details on
          this record are the exact snapshot printed on the PDF and shown on the public
          verify page.
        </p>
      </div>
    </div>
  );
}