"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, Loader2, Shield, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  EMPTY_STEP_UP,
  isStepUpComplete,
  StepUpFields,
  stepUpPayload,
  type StepUpValue,
} from "@/components/admin/StepUpFields";
import {
  issueCertificateAction,
  revokeCertificateAction,
  reissueCertificateAction,
} from "@/server/actions/certificates";
import {
  SignatorySelector,
  type SignatoryOption,
  type SelectedSignatory,
} from "./SignatorySelector";
import { REVOKE_CATEGORY_OPTIONS } from "@/server/types/certificates";

type BaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{message}</p>;
}

function toIssuedSignatoryPayload(
  signatories: SelectedSignatory[],
  offset = 0
): Array<{
  id: string;
  signatoryId: string | null;
  name: string;
  title: string;
  designation: string;
  displayOrder: number;
}> {
  return signatories.map((sig, index) => ({
    id: "",
    signatoryId: sig.signatoryId ?? null,
    name: sig.name,
    title: sig.title,
    designation: sig.designation,
    displayOrder: sig.displayOrder ?? offset + index,
  }));
}

/**
 * Renders the certificate with the currently selected signatories WITHOUT issuing
 * it. The route streams a PDF back (placeholder number/token, nothing persisted)
 * and the browser opens it in a new tab, so the admin can review the exact
 * document before confirming.
 */
async function openCertificatePreview(
  certificateId: string,
  issueDate: string,
  issuedSignatories: SelectedSignatory[]
): Promise<void> {
  // Open the tab synchronously with the click so popup blockers allow it; it stays
  // on about:blank until the PDF blob arrives. Opening after an `await` loses the
  // user-gesture context and the browser silently swallows the new tab.
  const previewWindow = window.open("", "_blank");
  const discardTab = () => {
    try {
      previewWindow?.close();
    } catch {
      // already navigated or not script-opened: safe to ignore
    }
  };

  try {
    const response = await fetch(
      `/api/techdarbar/certificates/${encodeURIComponent(certificateId)}/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueDate: issueDate || null,
          issuedSignatories: toIssuedSignatoryPayload(issuedSignatories),
        }),
      }
    );
    if (!response.ok) {
      let message = "The preview could not be generated. Please try again.";
      try {
        const data = (await response.json()) as { error?: string };
        if (typeof data.error === "string") message = data.error;
      } catch {
        // non-JSON error body: keep the generic message
      }
      discardTab();
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.location.href = url;
    } else {
      // No window handle at all means the popup itself was blocked; try once more.
      window.open(url, "_blank");
    }
  } catch (error) {
    discardTab();
    throw error;
  }
}

/* ---------- Issue ---------- */

type IssueProps = BaseDialogProps & {
  certificateId: string;
  initialIssueDate?: string | null;
  signatoryOptions: SignatoryOption[];
};

export function IssueCertificateDialog({
  open,
  onOpenChange,
  certificateId,
  initialIssueDate,
  signatoryOptions,
}: IssueProps) {
  const router = useRouter();
  const { toast } = useToast();
  const remountKey = open ? certificateId : "__closed__";
  const [issueDate, setIssueDate] = React.useState<string>(
    () =>
      initialIssueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [issuedSignatories, setIssuedSignatories] = React.useState<SelectedSignatory[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);

  const onPreview = async () => {
    if (issuedSignatories.length === 0) return;
    setPreviewing(true);
    try {
      await openCertificatePreview(certificateId, issueDate, issuedSignatories);
    } catch (previewError) {
      toast({
        title: "Could not preview",
        description:
          previewError instanceof Error ? previewError.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setStepUpError(null);
    try {
      const payload = {
        id: certificateId,
        issueDate: issueDate || null,
        issuedSignatories: toIssuedSignatoryPayload(issuedSignatories),
        ...stepUpPayload(stepUp),
      };
      const result = await issueCertificateAction(payload);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setStepUpError(result.error);
        toast({
          title: "Could not issue certificate",
          description: result.error,
          variant: "error",
        });
        return;
      }
      const verifyUrl = `${window.location.origin}/verify/${result.data.verificationToken}`;
      toast({
        title: "Certificate issued",
        description: `${result.data.certificateNumber} is now verifiable at ${verifyUrl}`,
        variant: "success",
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
      setStepUp(EMPTY_STEP_UP);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        key={remountKey}
        aria-labelledby="issue-dialog-title"
        aria-describedby="issue-dialog-description"
      >
        <DialogHeader>
          <DialogTitle
            id="issue-dialog-title"
            className="flex items-center gap-2"
          >
            <Shield className="size-5 text-primary" />
            Issue certificate
          </DialogTitle>
          <DialogDescription id="issue-dialog-description">
            Issuing locks this certificate permanently and makes it verifiable publicly.
            The certificate number and verification token are generated automatically
            on the server — no manual entry needed. Double-check the signatories, as
            after issuing you must Revoke and Reissue to make corrections.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-sm">
          <Label htmlFor="issue-date" className="mb-1.5 block text-sm font-medium">
            Issue date
          </Label>
          <Input
            id="issue-date"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
            disabled={submitting}
            aria-invalid={fieldErrors.issueDate ? true : undefined}
          />
          <FieldError message={fieldErrors.issueDate?.[0]} />
        </div>

        <div className="mt-2">
          <SignatorySelector
            options={signatoryOptions}
            value={issuedSignatories}
            onChange={setIssuedSignatories}
            fieldErrors={fieldErrors}
            disabled={submitting}
          />
        </div>

        <div className="mt-4">
          <StepUpFields
            value={stepUp}
            onChange={setStepUp}
            error={stepUpError}
            disabled={submitting}
            idPrefix="issue"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPreview}
            disabled={submitting || previewing || issuedSignatories.length === 0}
            title={
              issuedSignatories.length === 0
                ? "Select at least one signatory to preview"
                : "Review the exact rendered certificate before issuing"
            }
          >
            {previewing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Preview
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || issuedSignatories.length === 0 || !isStepUpComplete(stepUp)}
            title={
              issuedSignatories.length === 0
                ? "Select at least one signatory to issue"
                : undefined
            }
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Issuing…
              </>
            ) : (
              <>
                <Shield className="size-4" />
                Issue certificate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Revoke ---------- */

type RevokeProps = BaseDialogProps & {
  certificateId: string;
  certificateNumber?: string | null;
  recipientName?: string;
  courseName?: string;
};

export function RevokeCertificateDialog({
  open,
  onOpenChange,
  certificateId,
  certificateNumber,
  recipientName,
  courseName,
}: RevokeProps) {
  const router = useRouter();
  const { toast } = useToast();
  const remountKey = open ? certificateId : "__closed__";
  const [revokeCategory, setRevokeCategory] = React.useState("");
  const [revokeReason, setRevokeReason] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    setStepUpError(null);
    try {
      const payload = {
        id: certificateId,
        revokeCategory,
        revokeReason,
        ...stepUpPayload(stepUp),
      };
      const result = await revokeCertificateAction(payload);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setStepUpError(result.error);
        toast({
          title: "Could not revoke",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Certificate revoked",
        description: `${certificateNumber ?? "Certificate"} now shows as REVOKED on public verify.`,
        variant: "success",
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
      setStepUp(EMPTY_STEP_UP);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        key={remountKey}
        aria-labelledby="revoke-dialog-title"
        aria-describedby="revoke-dialog-description"
      >
        <DialogHeader>
          <DialogTitle
            id="revoke-dialog-title"
            className="flex items-center gap-2 text-destructive"
          >
            <ShieldAlert className="size-5" />
            Revoke certificate
          </DialogTitle>
          <DialogDescription id="revoke-dialog-description">
            Revoking is <strong>permanent</strong>. The certificate will display as
            REVOKED on the public verify page. You can then Reissue a corrected copy
            with a new number and token.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
          {certificateNumber && (
            <p className="font-mono text-sm text-neutral-800">{certificateNumber}</p>
          )}
          {recipientName && (
            <p className="text-sm font-medium text-neutral-900">{recipientName}</p>
          )}
          {courseName && <p className="text-xs text-neutral-500">{courseName}</p>}
        </div>

        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This record stays preserved for audit. Students will see a revocation
            notice when they open the public /verify link.
          </p>
        </div>

        <div>
          <Label htmlFor="revoke-category" className="mb-1.5 block text-sm font-medium">
            Category <span className="text-destructive">*</span>
          </Label>
          <Select
            id="revoke-category"
            value={revokeCategory}
            onChange={(event) => setRevokeCategory(event.target.value)}
            disabled={submitting}
            placeholder="Select a category"
            options={[...REVOKE_CATEGORY_OPTIONS]}
          />
          <FieldError message={fieldErrors.revokeCategory?.[0]} />
        </div>

        <div>
          <Label htmlFor="revoke-reason" className="mb-1.5 block text-sm font-medium">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="revoke-reason"
            rows={4}
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            disabled={submitting}
            placeholder="e.g. Name misspelled, student data correction, withdrawn by request"
          />
          <FieldError message={fieldErrors.revokeReason?.[0]} />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={submitting}
            className="mt-0.5 size-4 accent-destructive"
          />
          <span>
            I understand that this certificate will{" "}
            <strong>no longer verify as valid</strong>.
          </span>
        </label>

        <StepUpFields
          value={stepUp}
          onChange={setStepUp}
          error={stepUpError}
          disabled={submitting}
          idPrefix="revoke"
        />

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onSubmit}
            disabled={submitting || !confirmed || !revokeCategory || !isStepUpComplete(stepUp)}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Revoking…
              </>
            ) : (
              "Revoke certificate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Reissue ---------- */

type ReissueProps = BaseDialogProps & {
  certificateId: string;
  initialIssueDate?: string | null;
  signatoryOptions: SignatoryOption[];
  previousCertificateNumber?: string | null;
};

export function ReissueCertificateDialog({
  open,
  onOpenChange,
  certificateId,
  initialIssueDate,
  signatoryOptions,
  previousCertificateNumber,
}: ReissueProps) {
  const router = useRouter();
  const { toast } = useToast();
  const remountKey = open ? certificateId : "__closed__";
  const [reissueReason, setReissueReason] = React.useState("");
  const [issueDate, setIssueDate] = React.useState<string>(
    () =>
      initialIssueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [issuedSignatories, setIssuedSignatories] = React.useState<SelectedSignatory[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);

  const onPreview = async () => {
    if (issuedSignatories.length === 0) return;
    setPreviewing(true);
    try {
      await openCertificatePreview(certificateId, issueDate, issuedSignatories);
    } catch (previewError) {
      toast({
        title: "Could not preview",
        description:
          previewError instanceof Error ? previewError.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setStepUpError(null);
    try {
      const payload = {
        id: certificateId,
        reissueReason,
        issueDate: issueDate || null,
        issuedSignatories: toIssuedSignatoryPayload(issuedSignatories),
        ...stepUpPayload(stepUp),
      };
      const result = await reissueCertificateAction(payload);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setStepUpError(result.error);
        toast({
          title: "Could not reissue",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Certificate reissued",
        description: `${previousCertificateNumber ?? "Previous"} → ${result.data.certificateNumber}. Old record now shows REISSUED.`,
        variant: "success",
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
      setStepUp(EMPTY_STEP_UP);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        key={remountKey}
        aria-labelledby="reissue-dialog-title"
        aria-describedby="reissue-dialog-description"
      >
        <DialogHeader>
          <DialogTitle
            id="reissue-dialog-title"
            className="flex items-center gap-2"
          >
            <Sparkles className="size-5 text-primary" />
            Reissue certificate
          </DialogTitle>
          <DialogDescription id="reissue-dialog-description">
            Creates a brand-new certificate with a fresh number and token generated
            automatically on the server. The original record is marked{" "}
            <strong>REISSUED</strong> (kept for audit), and the replacement is
            immediately verifiable.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="reissue-reason" className="mb-1.5 block text-sm font-medium">
            Reason for reissue <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reissue-reason"
            rows={3}
            value={reissueReason}
            onChange={(event) => setReissueReason(event.target.value)}
            disabled={submitting}
            placeholder="e.g. Corrected name spelling, replaced course name"
          />
          <FieldError message={fieldErrors.reissueReason?.[0]} />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <Label htmlFor="reissue-date" className="mb-1.5 block text-sm font-medium">
            Issue date
          </Label>
          <Input
            id="reissue-date"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
            disabled={submitting}
            aria-invalid={fieldErrors.issueDate ? true : undefined}
          />
          <FieldError message={fieldErrors.issueDate?.[0]} />
        </div>

        <SignatorySelector
          options={signatoryOptions}
          value={issuedSignatories}
          onChange={setIssuedSignatories}
          fieldErrors={fieldErrors}
          disabled={submitting}
        />

        <div className="mt-4">
          <StepUpFields
            value={stepUp}
            onChange={setStepUp}
            error={stepUpError}
            disabled={submitting}
            idPrefix="reissue"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPreview}
            disabled={submitting || previewing || issuedSignatories.length === 0}
            title={
              issuedSignatories.length === 0
                ? "Select at least one signatory to preview"
                : "Review the exact rendered certificate before reissuing"
            }
          >
            {previewing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Preview
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={
              submitting ||
              issuedSignatories.length === 0 ||
              !reissueReason.trim() ||
              !isStepUpComplete(stepUp)
            }
            title={
              issuedSignatories.length === 0
                ? "Select at least one signatory to reissue"
                : !reissueReason.trim()
                  ? "Enter a reason for the reissue"
                  : undefined
            }
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Reissuing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Reissue certificate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
