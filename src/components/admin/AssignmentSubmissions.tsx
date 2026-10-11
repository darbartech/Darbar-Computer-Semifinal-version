"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { reviewSubmissionAction } from "@/server/actions/assignments";
import { formatDate } from "@/lib/format";

type Submission = {
  id: string;
  url: string;
  reviewStatus: string;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

type StudentRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  approvalStatus: string;
  seenAt: string | null;
  submission: Submission | null;
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "outline"> = {
  SUBMITTED: "warning",
  REVIEWED: "success",
  NEEDS_WORK: "outline",
};

function ReviewControl({
  assignmentId,
  row,
}: {
  assignmentId: string;
  row: StudentRow;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const submission = row.submission;
  const [note, setNote] = React.useState(submission?.reviewNote ?? "");
  const [busy, setBusy] = React.useState<"REVIEWED" | "NEEDS_WORK" | null>(null);

  if (!submission) {
    return (
      <p className="text-sm text-neutral-500">
        {row.seenAt ? `Opened ${formatDate(row.seenAt)} — no link yet` : "Not opened yet"}
      </p>
    );
  }

  const decide = async (reviewStatus: "REVIEWED" | "NEEDS_WORK") => {
    setBusy(reviewStatus);
    const result = await reviewSubmissionAction({
      assignmentId,
      submissionId: submission.id,
      reviewStatus,
      reviewNote: note,
    });
    setBusy(null);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({
      title: reviewStatus === "REVIEWED" ? "Marked as reviewed" : "Sent back for changes",
      variant: "success",
    });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Short feedback the student sees in their portal"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="xs" onClick={() => decide("REVIEWED")} disabled={busy !== null}>
          {busy === "REVIEWED" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Reviewed
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => decide("NEEDS_WORK")}
          disabled={busy !== null}
        >
          {busy === "NEEDS_WORK" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
          Needs work
        </Button>
      </div>
      {submission.reviewedAt && (
        <p className="text-xs text-neutral-500">
          {submission.reviewStatus === "REVIEWED" ? "Reviewed" : "Returned"}{" "}
          {formatDate(submission.reviewedAt)}
          {submission.reviewedByName ? ` by ${submission.reviewedByName}` : ""}
        </p>
      )}
    </div>
  );
}

export function AssignmentSubmissions({
  assignmentId,
  rows,
  canWrite,
}: {
  assignmentId: string;
  rows: StudentRow[];
  canWrite: boolean;
}) {
  const outstanding = rows.filter((row) => !row.submission).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Assigned student</th>
                <th className="px-4 py-3 font-semibold">Submitted link</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-neutral-500">
                    Nobody is assigned to this task yet. Edit the assignment and tick the students
                    who should do it.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.studentId} className="align-top hover:bg-neutral-50/70">
                  <td className="px-4 py-4">
                    <div className="font-medium text-neutral-900">{row.studentName}</div>
                    <div className="mt-0.5 text-xs text-neutral-600">{row.studentCode}</div>
                    {row.approvalStatus !== "APPROVED" && (
                      <Badge className="mt-1.5" variant="warning">
                        {row.approvalStatus.toLowerCase()}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {row.submission ? (
                      <>
                        <a
                          href={row.submission.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex max-w-xs items-center gap-1 truncate text-primary hover:underline"
                        >
                          <span className="truncate">{row.submission.url}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatDate(row.submission.updatedAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-neutral-400">No link yet</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {row.submission ? (
                      <Badge variant={STATUS_VARIANT[row.submission.reviewStatus] ?? "outline"}>
                        {row.submission.reviewStatus.replace("_", " ").toLowerCase()}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">not submitted</Badge>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {canWrite ? (
                      <ReviewControl assignmentId={assignmentId} row={row} />
                    ) : (
                      <span className="text-sm text-neutral-600">
                        {row.submission?.reviewStatus.toLowerCase() ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-neutral-600">
        {outstanding === 0
          ? "Every assigned student has handed in a link."
          : `${outstanding} of ${rows.length} assigned students have not submitted yet.`}{" "}
        When a student posts a new link the review resets to SUBMITTED, so the changed work comes
        back for a second look.
      </p>
    </div>
  );
}
