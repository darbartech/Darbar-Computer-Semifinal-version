"use client";
import * as React from "react";
import {
  Shield,
  ShieldAlert,
  Sparkles,
  FileDown,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  Undo2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import {
  regenerateCertificatePdfAction,
  returnCertificateToDraftAction,
  submitForReviewCertificateAction,
} from "@/server/actions/certificates";
import type { AdminCertificateDetail } from "@/server/types/certificates";
import type { SignatoryOption } from "./SignatorySelector";
import {
  IssueCertificateDialog,
  RevokeCertificateDialog,
  ReissueCertificateDialog,
} from "./CertificateDialogs";
import { STATUS_VARIANT, statusLabel } from "./status";

type Props = {
  certificate: AdminCertificateDetail;
  signatoryOptions: SignatoryOption[];
  canReview: boolean;
  canIssue: boolean;
  canRevoke: boolean;
  canReissue: boolean;
  canRegeneratePdf: boolean;
};

export function CertificateDetailPanel({
  certificate,
  signatoryOptions,
  canReview,
  canIssue,
  canRevoke,
  canReissue,
  canRegeneratePdf,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [reissueOpen, setReissueOpen] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [reviewBusy, setReviewBusy] = React.useState(false);

  // Carry the draft's issue date into the confirm dialog so it is entered once,
  // not twice (the Issue dialog used to default to today and silently override
  // the date already set in the form).
  const initialIssueDate =
    certificate.issueDate ?? certificate.completionDate ?? undefined;

  const canIssueBtn =
    canIssue &&
    (certificate.status === "DRAFT" || certificate.status === "PENDING_ISSUE");
  const canRevokeBtn =
    canRevoke &&
    (certificate.status === "ISSUED" || certificate.status === "REISSUED");
  const canReissueBtn =
    canReissue &&
    // Only the live document is reissued: the row a previous reissue superseded
    // has its own replacement, and re-issuing it would print a second live copy.
    certificate.status === "ISSUED";
  const canRegenerateBtn =
    canRegeneratePdf &&
    (certificate.status === "ISSUED" || certificate.status === "REISSUED");

  const onRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerateCertificatePdfAction({ id: certificate.id });
      if (!result.ok) {
        toast({
          title: "Could not regenerate",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "PDF regenerated",
        description: "The fresh PDF is now ready to download.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setRegenerating(false);
    }
  };

  const onSubmitForReview = async () => {
    setReviewBusy(true);
    try {
      const result = await submitForReviewCertificateAction({ id: certificate.id });
      if (!result.ok) {
        toast({
          title: "Could not submit",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Submitted for review",
        description: "The draft now shows PENDING_ISSUE and is ready for approval.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setReviewBusy(false);
    }
  };

  const onReturnToDraft = async () => {
    setReviewBusy(true);
    try {
      const result = await returnCertificateToDraftAction({ id: certificate.id });
      if (!result.ok) {
        toast({
          title: "Could not move back",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Moved back to draft",
        description: "Edits are re-enabled on the draft.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={STATUS_VARIANT[certificate.status] ?? "outline"}>
            {statusLabel(certificate.status)}
          </Badge>
          {certificate.certificateNumber && (
            <span className="font-mono text-xs text-neutral-500">
              No. {certificate.certificateNumber}
            </span>
          )}
          {certificate.verificationToken &&
            (certificate.status === "ISSUED" ||
              certificate.status === "REVOKED" ||
              certificate.status === "REISSUED" ||
              certificate.status === "EXPIRED") && (
              <a
                href={`/verify/${certificate.verificationToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                Public verify →
              </a>
            )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReview && certificate.status === "DRAFT" && (
            <Button
              type="button"
              variant="outline"
              onClick={onSubmitForReview}
              disabled={reviewBusy}
            >
              {reviewBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ClipboardCheck className="size-4" />
              )}
              Submit for review
            </Button>
          )}
          {canReview && certificate.status === "PENDING_ISSUE" && (
            <Button
              type="button"
              variant="outline"
              onClick={onReturnToDraft}
              disabled={reviewBusy}
            >
              {reviewBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Move back to draft
            </Button>
          )}
          {canIssueBtn && (
            <Button type="button" onClick={() => setIssueOpen(true)}>
              <Shield className="size-4" />
              {certificate.status === "PENDING_ISSUE" ? "Approve & issue" : "Issue"}
            </Button>
          )}
          {canRevokeBtn && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setRevokeOpen(true)}
            >
              <ShieldAlert className="size-4" />
              Revoke
            </Button>
          )}
          {canReissueBtn && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReissueOpen(true)}
            >
              <Sparkles className="size-4" />
              Reissue
            </Button>
          )}
          {canRegenerateBtn && (
            <Button
              type="button"
              variant="outline"
              onClick={onRegenerate}
              disabled={regenerating}
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Regenerate PDF
            </Button>
          )}
          {(certificate.status === "ISSUED" || certificate.status === "REISSUED") && (
            <a
              href={`/api/techdarbar/certificates/${certificate.id}/download`}
              className={buttonVariants({ variant: "outline" })}
            >
              <FileDown className="size-4" />
              Download
            </a>
          )}
        </div>
      </div>

      <IssueCertificateDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        certificateId={certificate.id}
        initialIssueDate={initialIssueDate}
        signatoryOptions={signatoryOptions}
      />

      <RevokeCertificateDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        certificateId={certificate.id}
        certificateNumber={certificate.certificateNumber}
        recipientName={certificate.recipientName}
        courseName={certificate.courseName}
      />

      <ReissueCertificateDialog
        open={reissueOpen}
        onOpenChange={setReissueOpen}
        certificateId={certificate.id}
        initialIssueDate={initialIssueDate}
        signatoryOptions={signatoryOptions}
        previousCertificateNumber={certificate.certificateNumber}
      />
    </>
  );
}
