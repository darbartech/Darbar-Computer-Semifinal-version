import { Badge } from "@/components/common/Badge";
import { LEAD_STATUS_LABELS } from "@/lib/validators/lead";
import { MESSAGE_STATUS_LABELS } from "@/lib/validators/contact";
import type { BadgeProps } from "@/components/common/Badge";

const LEAD_STATUS_VARIANT: Record<keyof typeof LEAD_STATUS_LABELS, BadgeProps["variant"]> = {
  NEW: "default",
  CONTACTED: "secondary",
  COUNSELING_DONE: "accent",
  DEMO_SCHEDULED: "warning",
  ENROLLED: "success",
  LOST: "destructive",
  SPAM: "destructive",
};

const MESSAGE_STATUS_VARIANT: Record<keyof typeof MESSAGE_STATUS_LABELS, BadgeProps["variant"]> = {
  NEW: "default",
  READ: "secondary",
  REPLIED: "success",
  ARCHIVED: "outline",
  SPAM: "destructive",
};

export function LeadStatusBadge({ status }: { status: keyof typeof LEAD_STATUS_LABELS }) {
  return <Badge variant={LEAD_STATUS_VARIANT[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}

export function MessageStatusBadge({ status }: { status: keyof typeof MESSAGE_STATUS_LABELS }) {
  return <Badge variant={MESSAGE_STATUS_VARIANT[status]}>{MESSAGE_STATUS_LABELS[status]}</Badge>;
}

/**
 * Enrollment outcomes (docs 02 B6). REJECTED (staff said no, with a note) and
 * DROPPED (the student left) look alike in the enum but mean different things
 * to the student, so they get different colours instead of sharing "outline".
 */
const ENROLLMENT_STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  PENDING: "warning",
  ACTIVE: "success",
  COMPLETED: "secondary",
  DROPPED: "outline",
  REJECTED: "destructive",
  WAITLISTED: "accent",
};

export function EnrollmentStatusBadge({ status }: { status: string }) {
  return <Badge variant={ENROLLMENT_STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>;
}
