"use client";
import * as React from "react";
import { Eye } from "lucide-react";
import { fmtDate } from "@/lib/dates";
import type { AdminCertificateDetail } from "@/server/types/certificates";

type Props = {
  certificate: AdminCertificateDetail;
};

function formatNepaliDate(iso: string | null): string {
  if (!iso) return "—";
  return fmtDate(iso, { dateStyle: "long" });
}

/**
 * Read-only summary of everything that appears on the certificate itself. The status
 * badge, certificate number, public verify link and download actions live in the
 * top toolbar above, so this panel stays focused on the printed content.
 */
export function PreviewPanel({ certificate }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-6 py-4">
        <Eye className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-neutral-900">Certificate preview</h3>
      </div>

      <div className="grid gap-6 p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2 text-sm">
          <InfoRow label="Recipient" value={certificate.recipientName} />
          <InfoRow
            label="Student ID"
            value={certificate.recipientIdNumber ?? "—"}
            muted
          />
          <InfoRow label="Course" value={certificate.courseName} />
          <InfoRow
            label="Grade"
            value={certificate.grade ?? "—"}
            muted={!certificate.grade}
          />
          <InfoRow
            label="Completion date"
            value={formatNepaliDate(certificate.completionDate)}
          />
          <InfoRow label="Issue date" value={formatNepaliDate(certificate.issueDate)} />
          {certificate.revokedAt && (
            <InfoRow
              label="Revoked at"
              value={formatNepaliDate(certificate.revokedAt)}
              accent="destructive"
            />
          )}
          {certificate.revokedAt && (
            <InfoRow label="Revocation reason" value={certificate.revokeReason ?? "—"} />
          )}
          {certificate.reissuedAt && (
            <InfoRow
              label="Reissued at"
              value={formatNepaliDate(certificate.reissuedAt)}
              accent="warning"
            />
          )}
          {certificate.reissuedAt && (
            <InfoRow label="Reissue reason" value={certificate.reissueReason ?? "—"} />
          )}
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Modules / Items
            </h4>
            {certificate.items.length === 0 ? (
              <p className="text-xs text-neutral-400">No items added</p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {certificate.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium text-neutral-900">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-neutral-500">{item.subtitle}</p>
                      )}
                    </div>
                    {item.shortLabel && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        {item.shortLabel}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Signatories (snapshot)
            </h4>
            {certificate.issuedSignatories.length === 0 ? (
              <p className="text-xs text-neutral-400">
                Not yet issued — signatories are captured when you click Issue.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {certificate.issuedSignatories
                  .slice()
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((sig) => (
                    <li key={sig.id} className="p-3">
                      <p className="font-medium text-neutral-900">{sig.name}</p>
                      <p className="text-xs text-neutral-500">
                        {sig.title} · {sig.designation}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
    <div className="grid grid-cols-[120px,1fr] gap-2 border-b border-neutral-100 py-1.5 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className={`text-sm ${valueClass}`}>{value}</span>
    </div>
  );
}