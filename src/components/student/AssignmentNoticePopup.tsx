"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";

export type AssignmentNotice = {
  id: string;
  title: string;
  courseTitle: string;
  dueDate: string | null;
  isOverdue: boolean;
};

/**
 * Client-side popup for assignments the student has not opened yet. It only
 * reports them — the `seenAt` marker is cleared by `MarkAssignmentsSeen` on the
 * assignments page, so dismissing this popup leaves the task unread and it is
 * announced again next visit.
 */
export function AssignmentNoticePopup({ notices }: { notices: AssignmentNotice[] }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, [notices.length]);

  if (notices.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            {notices.length === 1 ? "New assignment" : `${notices.length} new assignments`}
          </DialogTitle>
          <DialogDescription>
            An instructor has set work for you. Submit one link per assignment.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 px-6 pb-2">
          {notices.slice(0, 3).map((notice) => (
            <li
              key={notice.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{notice.title}</p>
                <p className="truncate text-xs text-neutral-500">{notice.courseTitle}</p>
              </div>
              {notice.dueDate && (
                <Badge variant={notice.isOverdue ? "destructive" : "outline"}>
                  {notice.isOverdue ? "was due" : "due"} {formatDate(notice.dueDate)}
                </Badge>
              )}
            </li>
          ))}
          {notices.length > 3 && (
            <li className="text-xs text-neutral-500">
              +{notices.length - 3} more in your assignments list
            </li>
          )}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Later
          </Button>
          <Link
            href="/student/assignments"
            onClick={() => setOpen(false)}
            className={buttonVariants({ size: "sm" })}
          >
            Open assignments
            <ArrowRight className="size-4" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
