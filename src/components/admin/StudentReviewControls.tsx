"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EnrollmentStatusBadge } from "@/components/admin/StatusBadges";
import {
  approveEnrollmentAction,
  approveStudentAction,
  declineEnrollmentAction,
  moveEnrollmentBatchAction,
  rejectStudentAction,
  waitlistEnrollmentAction,
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

/**
 * One seat-bearing batch, passed down from the page (docs 02 B1). The client
 * never imports the DAL type — the server-only module cannot be referenced
 * from here, so the shape is restated.
 */
export type EnrollmentSeatOption = {
  id: string;
  courseId: string;
  name: string;
  startDate: string;
  timeSlot: string;
  seatsLeft: number;
};

export type EnrollmentDecisionRow = {
  id: string;
  status: string;
  courseId: string;
  courseTitle: string;
  requestedAt: string;
  batchName: string | null;
  decisionNote: string | null;
};

function seatLabel(batch: EnrollmentSeatOption): string {
  const seats =
    batch.seatsLeft === 0
      ? "waiting list only"
      : `${batch.seatsLeft} seat${batch.seatsLeft === 1 ? "" : "s"} left`;
  return `${batch.name} · ${batch.timeSlot} · ${seats}`;
}

/**
 * Approve / waitlist / decline for one request. Approval always names a batch,
 * because a seat is only ever taken through one; a full batch comes back as an
 * error and the row stays pending so staff can waitlist instead.
 */
export function EnrollmentDecisionList({
  enrollments,
  batches,
  canManage,
}: {
  enrollments: EnrollmentDecisionRow[];
  batches: EnrollmentSeatOption[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [chosenBatch, setChosenBatch] = React.useState<Record<string, string>>({});
  const [decliningId, setDecliningId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  const run = async (
    enrollmentId: string,
    call: () => Promise<{ ok: boolean; error?: string }>,
    successTitle: string
  ) => {
    setBusyId(enrollmentId);
    const result = await call();
    setBusyId(null);
    if (!result.ok) {
      toast({ title: result.error ?? "Something went wrong. Please try again.", variant: "error" });
      return false;
    }
    toast({ title: successTitle, variant: "success" });
    router.refresh();
    return true;
  };

  const decide = async (
    enrollment: EnrollmentDecisionRow,
    status: "ACTIVE" | "WAITLISTED" | "REJECTED"
  ) => {
    const batchId = chosenBatch[enrollment.id] ?? "";
    if (status === "ACTIVE") {
      if (!batchId) {
        toast({ title: "Choose which batch to place the student in", variant: "error" });
        return;
      }
      const ok = await run(
        enrollment.id,
        () => approveEnrollmentAction({ enrollmentId: enrollment.id, batchId }),
        "Enrollment approved and a seat taken"
      );
      if (ok) setDecliningId(null);
      return;
    }
    if (status === "WAITLISTED") {
      await run(
        enrollment.id,
        () => waitlistEnrollmentAction({ enrollmentId: enrollment.id, batchId, note }),
        "Added to the waiting list (no seat taken)"
      );
      return;
    }
    const ok = await run(
      enrollment.id,
      () => declineEnrollmentAction({ enrollmentId: enrollment.id, note }),
      "Enrollment declined"
    );
    if (ok) {
      setDecliningId(null);
      setNote("");
    }
  };

  const moveTo = async (enrollmentId: string, batchId: string) => {
    await run(
      enrollmentId,
      () => moveEnrollmentBatchAction({ enrollmentId, batchId }),
      "Moved to the selected batch"
    );
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
      {enrollments.map((enrollment) => {
        const options = batches.filter((batch) => batch.courseId === enrollment.courseId);
        const awaiting = enrollment.status === "PENDING" || enrollment.status === "WAITLISTED";
        const isBusy = busyId === enrollment.id;
        const selected = chosenBatch[enrollment.id] ?? "";
        return (
          <li key={enrollment.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {enrollment.courseTitle}
                </p>
                <p className="text-xs text-neutral-500">
                  Requested {enrollment.requestedAt}
                  {enrollment.batchName ? ` · ${enrollment.batchName}` : ""}
                </p>
              </div>
              <EnrollmentStatusBadge status={enrollment.status} />
            </div>

            {enrollment.decisionNote && (
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Note: {enrollment.decisionNote}
              </p>
            )}

            {canManage && (awaiting || enrollment.status === "ACTIVE") && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {options.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    No open batch for this course yet — create one (or cancel one back to open)
                    before approving.
                  </p>
                ) : (
                  <>
                    <div className="w-full sm:w-72">
                      <Select
                        aria-label={`Batch for ${enrollment.courseTitle}`}
                        value={selected}
                        disabled={isBusy}
                        onChange={(event) =>
                          setChosenBatch((current) => ({
                            ...current,
                            [enrollment.id]: event.target.value,
                          }))
                        }
                        placeholder="Choose a batch"
                        options={options.map((batch) => ({
                          value: batch.id,
                          label: seatLabel(batch),
                          disabled: batch.seatsLeft === 0,
                        }))}
                      />
                    </div>
                    {awaiting && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => decide(enrollment, "ACTIVE")}
                          disabled={isBusy || !selected}
                        >
                          {isBusy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide(enrollment, "WAITLISTED")}
                          disabled={isBusy}
                        >
                          <Clock className="size-3.5" />
                          Waitlist
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDecliningId((current) => (current === enrollment.id ? null : enrollment.id));
                            setNote("");
                          }}
                          disabled={isBusy}
                        >
                          <X className="size-3.5" />
                          Decline
                        </Button>
                      </>
                    )}
                    {enrollment.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => moveTo(enrollment.id, selected)}
                        disabled={isBusy || !selected}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="size-3.5" />
                        )}
                        Move to batch
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {canManage && decliningId === enrollment.id && (
              <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason shown to the student (required)"
                  rows={2}
                  maxLength={300}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDecliningId(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => decide(enrollment, "REJECTED")}
                    disabled={isBusy || note.trim().length < 3}
                  >
                    {isBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Confirm decline
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
