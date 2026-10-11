"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, Link2, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/ui/toast";
import { submitAssignmentAction } from "@/server/actions/student";
import { formatDate } from "@/lib/format";

export type StudentAssignmentProps = {
  id: string;
  title: string;
  instructions: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  isNew: boolean;
  courseTitle: string;
  courseSlug: string;
  submission: {
    url: string;
    reviewStatus: string;
    reviewNote: string | null;
    updatedAt: string;
  } | null;
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "outline"> = {
  SUBMITTED: "warning",
  REVIEWED: "success",
  NEEDS_WORK: "outline",
};

export function AssignmentTask({
  id,
  title,
  instructions,
  dueDate,
  isOverdue,
  isNew,
  courseTitle,
  courseSlug,
  submission,
}: StudentAssignmentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = React.useState(submission?.url ?? "");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const pastDue = isOverdue && !submission;

  const send = async () => {
    setFieldError(null);
    setPending(true);
    try {
      const result = await submitAssignmentAction({ assignmentId: id, url });
      if (!result.ok) {
        const message = result.fieldErrors?.url?.[0] ?? result.error;
        setFieldError(message);
        toast({ title: message, variant: "error" });
        return;
      }
      toast({ title: "Link submitted", variant: "success" });
      router.refresh();
    } catch {
      setFieldError("Could not reach the site. Check your connection and try again.");
      toast({ title: "Submission failed", variant: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-neutral-200 bg-white shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold text-neutral-900 leading-snug">{title}</h3>
            <Link
              href={`/courses/${courseSlug}`}
              className="text-xs text-neutral-600 hover:text-primary hover:underline"
            >
              {courseTitle}
            </Link>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isNew && <Badge variant="default">New</Badge>}
            {dueDate ? (
              <Badge variant={pastDue ? "destructive" : "secondary"}>
                {pastDue ? "Was due" : "Due"} {formatDate(dueDate)}
              </Badge>
            ) : (
              <Badge variant="outline">No due date</Badge>
            )}
            {submission && (
              <Badge variant={STATUS_VARIANT[submission.reviewStatus] ?? "outline"}>
                {submission.reviewStatus.replace("_", " ").toLowerCase()}
              </Badge>
            )}
          </div>
        </div>

        {instructions && (
          <p className="whitespace-pre-line text-sm text-neutral-700">{instructions}</p>
        )}

        {submission?.reviewNote && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <CheckCircle2 className="size-3.5" />
              Instructor note
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-800">
              {submission.reviewNote}
            </p>
          </div>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Label htmlFor={`link-${id}`} className="text-sm font-medium text-neutral-800">
            {submission ? "Update your link" : "Your task link"}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id={`link-${id}`}
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={pending || url.trim() === ""}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {submission ? "Re-submit" : "Submit"}
            </Button>
          </div>
          {fieldError && (
            <p className="text-xs font-medium text-destructive">{fieldError}</p>
          )}
          <p className="text-xs text-neutral-500">
            {submission ? (
              <>
                Submitted {formatDate(submission.updatedAt)} ·{" "}
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {submission.url}
                  <ExternalLink className="size-3" />
                </a>
              </>
            ) : (
              "Paste a public link to your work — a GitHub repo, hosted site or shared document."
            )}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
