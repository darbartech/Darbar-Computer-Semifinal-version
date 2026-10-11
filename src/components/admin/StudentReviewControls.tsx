"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/common/Badge";
import {
  approveStudentAction,
  rejectStudentAction,
  setEnrollmentDecisionAction,
} from "@/server/actions/student-admin";

export function StudentReviewControls({
  studentId,
  status,
  canManage,
}: {
  studentId: string;
  status: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (!canManage) return null;

  const onApprove = async () => {
    setBusy("approve");
    const result = await approveStudentAction({ id: studentId });
    setBusy(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "Student approved", variant: "success" });
    router.refresh();
  };

  const onReject = async () => {
    setBusy("reject");
    const result = await rejectStudentAction({ id: studentId, reason });
    setBusy(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "Registration rejected", variant: "success" });
    setRejecting(false);
    setReason("");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "APPROVED" && (
          <Button onClick={onApprove} disabled={busy !== null}>
            {busy === "approve" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve registration
          </Button>
        )}
        {status !== "REJECTED" && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setRejecting((v) => !v)}
            disabled={busy !== null}
          >
            <X className="size-4" />
            Reject
          </Button>
        )}
        {status !== "PENDING" && (
          <span className="text-xs text-neutral-500">
            Currently {status.toLowerCase()}
            {status === "APPROVED" ? " — approval can be revoked by rejecting." : "."}
          </span>
        )}
      </div>
      {rejecting && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason shown to the student (required)"
            rows={3}
            maxLength={300}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={onReject}
              disabled={busy !== null || reason.trim().length < 3}
            >
              {busy === "reject" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Confirm rejection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ENROLLMENT_VARIANT: Record<string, "warning" | "success" | "secondary" | "outline"> = {
  PENDING: "warning",
  ACTIVE: "success",
  COMPLETED: "secondary",
  DROPPED: "outline",
};

export function EnrollmentDecisionList({
  enrollments,
  canManage,
}: {
  enrollments: {
    id: string;
    status: string;
    courseTitle: string;
    requestedAt: string;
  }[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const decide = async (enrollmentId: string, status: "ACTIVE" | "DROPPED") => {
    setBusyId(enrollmentId);
    const result = await setEnrollmentDecisionAction({ enrollmentId, status });
    setBusyId(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({
      title: status === "ACTIVE" ? "Enrollment approved" : "Enrollment declined",
      variant: "success",
    });
    router.refresh();
  };

  if (enrollments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500">
        No course requests yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
      {enrollments.map((enrollment) => (
        <li key={enrollment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">
              {enrollment.courseTitle}
            </p>
            <p className="text-xs text-neutral-500">Requested {enrollment.requestedAt}</p>
          </div>
          <Badge variant={ENROLLMENT_VARIANT[enrollment.status] ?? "outline"}>
            {enrollment.status}
          </Badge>
          {canManage && enrollment.status === "PENDING" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide(enrollment.id, "ACTIVE")}
                disabled={busyId === enrollment.id}
              >
                {busyId === enrollment.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => decide(enrollment.id, "DROPPED")}
                disabled={busyId === enrollment.id}
              >
                <X className="size-3.5" />
                Decline
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
