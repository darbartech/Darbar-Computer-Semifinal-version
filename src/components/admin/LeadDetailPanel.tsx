"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  MessageSquare,
  Phone,
  Save,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/common/Badge";
import { LeadStatusBadge } from "@/components/admin/StatusBadges";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  addLeadNote,
  assignLead,
  hardDeleteLeads,
  setLeadFollowUp,
  updateLeadStatus,
} from "@/server/actions/leads";
import {
  LEAD_STATUS_FLOW,
  LEAD_STATUS_LABELS,
} from "@/lib/validators/lead";
import { MANUAL_ACTIVITY_TYPES } from "@/lib/validators/shared";
import type { LeadDetail } from "@/server/dal/leads";
import {
  formatDateTime,
  fromLocalDateTimeInput,
  toDialablePhone,
  toLocalDateTimeInput,
  waLink,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type LeadDetailPanelProps = {
  lead: LeadDetail;
  assignees: { id: string; name: string }[];
  duplicates: { id: string; fullName: string; createdAt: string }[];
  canDelete: boolean;
};

const ACTIVITY_LABELS: Record<LeadDetail["activities"][number]["type"], string> = {
  NOTE: "Note",
  CALL: "Call",
  STATUS_CHANGE: "Status change",
  ASSIGNMENT: "Assignment",
  FOLLOW_UP: "Follow-up",
};

export function LeadDetailPanel({
  lead,
  assignees,
  duplicates,
  canDelete,
}: LeadDetailPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const [assigneeId, setAssigneeId] = React.useState(lead.assigneeId ?? "");
  const [followUpInput, setFollowUpInput] = React.useState(
    toLocalDateTimeInput(lead.followUpAt)
  );

  const [lostOpen, setLostOpen] = React.useState(false);
  const [lostReason, setLostReason] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [noteType, setNoteType] = React.useState<(typeof MANUAL_ACTIVITY_TYPES)[number]>("NOTE");
  const [noteBody, setNoteBody] = React.useState("");

  const isTerminal = lead.status === "LOST" || lead.status === "SPAM";
  const currentIndex = LEAD_STATUS_FLOW.indexOf(
    lead.status as (typeof LEAD_STATUS_FLOW)[number]
  );

  const changeStatus = async (status: string) => {
    if (status === lead.status) return;
    setBusyAction(status);
    const result = await updateLeadStatus({ id: lead.id, status });
    setBusyAction(null);
    if (!result.ok) {
      toast({ title: "Could not update status", description: result.error, variant: "error" });
      return;
    }
    toast({
      title: `Marked as ${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]}`,
      variant: "success",
    });
    router.refresh();
  };

  const confirmLost = async () => {
    if (!lostReason.trim()) return;
    setBusy(true);
    const result = await updateLeadStatus({
      id: lead.id,
      status: "LOST",
      lostReason: lostReason.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not mark as lost", description: result.error, variant: "error" });
      return;
    }
    setLostOpen(false);
    setLostReason("");
    toast({ title: "Marked as lost", variant: "success" });
    router.refresh();
  };

  const saveAssignee = async () => {
    setBusy(true);
    const result = await assignLead({ id: lead.id, assigneeId: assigneeId || null });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not assign", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Assignee updated", variant: "success" });
    router.refresh();
  };

  const saveFollowUp = async () => {
    setBusy(true);
    const result = await setLeadFollowUp({
      id: lead.id,
      followUpAt: fromLocalDateTimeInput(followUpInput),
    });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not save follow-up", description: result.error, variant: "error" });
      return;
    }
    toast({
      title: followUpInput ? "Follow-up scheduled" : "Follow-up cleared",
      variant: "success",
    });
    router.refresh();
  };

  const submitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setBusy(true);
    const result = await addLeadNote({
      id: lead.id,
      type: noteType,
      body: noteBody.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not save note", description: result.error, variant: "error" });
      return;
    }
    setNoteBody("");
    toast({ title: "Added to the timeline", variant: "success" });
    router.refresh();
  };

  const runDelete = async () => {
    setBusy(true);
    const result = await hardDeleteLeads({ ids: [lead.id] });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not delete", description: result.error, variant: "error" });
      return;
    }
    setDeleteOpen(false);
    router.push("/techdarbar/leads");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {duplicates.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-neutral-900">
              This phone number appears on {duplicates.length} other lead
              {duplicates.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  <Link
                    href={`/techdarbar/leads/${duplicate.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {duplicate.fullName}
                  </Link>{" "}
                  <span className="text-neutral-500">
                    created {formatDateTime(duplicate.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact &amp; inquiry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <a href={`tel:${toDialablePhone(lead.phone)}`} className="group/btn">
                <Button size="sm">
                  <Phone className="size-4" />
                  Call
                </Button>
              </a>
              <a
                href={waLink(lead.phone)}
                target="_blank"
                rel="noreferrer noopener"
                className="group/btn"
              >
                <Button size="sm" variant="outline">
                  <MessageSquare className="size-4" />
                  WhatsApp
                </Button>
              </a>
              <span className="text-sm text-neutral-700">{lead.phone}</span>
            </div>

            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Email</dt>
                <dd className="mt-0.5 text-neutral-900">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="hover:text-primary hover:underline">
                      {lead.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">
                  Interested course
                </dt>
                <dd className="mt-0.5 text-neutral-900">
                  {lead.courseSlug ? (
                    <a
                      href={`/courses/${lead.courseSlug}`}
                      className="font-medium text-primary hover:underline"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {lead.courseTitle}
                    </a>
                  ) : (
                    (lead.courseTitle ?? "—")
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Source</dt>
                <dd className="mt-0.5 text-neutral-900">{lead.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">UTM</dt>
                <dd className="mt-0.5 text-neutral-900">
                  {lead.utmCampaign || lead.utmSource || lead.utmMedium ? (
                    <span className="flex flex-wrap gap-1.5">
                      {lead.utmSource && <Badge variant="outline">source: {lead.utmSource}</Badge>}
                      {lead.utmMedium && <Badge variant="outline">medium: {lead.utmMedium}</Badge>}
                      {lead.utmCampaign && (
                        <Badge variant="outline">campaign: {lead.utmCampaign}</Badge>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {lead.referrerUrl && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Referrer</dt>
                  <dd className="mt-0.5 break-all text-neutral-900">{lead.referrerUrl}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">
                  Consent given
                </dt>
                <dd className="mt-0.5 text-neutral-900">{formatDateTime(lead.consentAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Created</dt>
                <dd className="mt-0.5 text-neutral-900">{formatDateTime(lead.createdAt)}</dd>
              </div>
            </dl>

            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Message</p>
              {lead.message ? (
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-sm text-neutral-800">
                  {lead.message}
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">No message was left.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <LeadStatusBadge status={lead.status} />
                {lead.enrolledAt && (
                  <Badge variant="success">Enrolled {formatDateTime(lead.enrolledAt)}</Badge>
                )}
              </div>

              {lead.status === "LOST" && lead.lostReason && (
                <p className="rounded-xl bg-destructive/5 p-3 text-sm text-neutral-800">
                  <span className="font-semibold">Lost reason:</span> {lead.lostReason}
                </p>
              )}

              <ol className="flex flex-wrap gap-2">
                {LEAD_STATUS_FLOW.map((status, index) => {
                  const done = currentIndex >= 0 && index <= currentIndex;
                  const active = lead.status === status;
                  return (
                    <li key={status}>
                      <Button
                        size="sm"
                        variant={active ? "default" : done ? "secondary" : "outline"}
                        disabled={busyAction !== null || isTerminal}
                        onClick={() => changeStatus(status)}
                      >
                        {busyAction === status && <Loader2 className="size-4 animate-spin" />}
                        {done && !active && <Check className="size-4" />}
                        {LEAD_STATUS_LABELS[status]}
                      </Button>
                    </li>
                  );
                })}
              </ol>

              {!isTerminal && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyAction !== null}
                    onClick={() => setLostOpen(true)}
                  >
                    Mark as lost
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => changeStatus("SPAM")}
                  >
                    Mark as spam
                  </Button>
                </div>
              )}

              {isTerminal && (
                <p className="text-xs text-neutral-500">
                  This lead is {LEAD_STATUS_LABELS[lead.status].toLowerCase()}. Reopen it by
                  choosing a stage above.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ownership &amp; follow-up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead-assignee" className="text-xs text-neutral-600">
                  Assignee
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-56 flex-1">
                    <Select
                      id="lead-assignee"
                      value={assigneeId}
                      onChange={(event) => setAssigneeId(event.target.value)}
                      options={[
                        { value: "", label: "Unassigned" },
                        ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
                      ]}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || assigneeId === (lead.assigneeId ?? "")}
                    onClick={saveAssignee}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-follow-up" className="text-xs text-neutral-600">
                  Follow-up at (Kathmandu time)
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-56 flex-1">
                    <Input
                      id="lead-follow-up"
                      type="datetime-local"
                      value={followUpInput}
                      onChange={(event) => setFollowUpInput(event.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || followUpInput === toLocalDateTimeInput(lead.followUpAt)}
                    onClick={saveFollowUp}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save
                  </Button>
                  {lead.followUpAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setFollowUpInput("");
                        void setLeadFollowUp({ id: lead.id, followUpAt: null }).then((result) => {
                          if (!result.ok) {
                            toast({
                              title: "Could not clear follow-up",
                              description: result.error,
                              variant: "error",
                            });
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {canDelete && (
                <div className="border-t border-neutral-200 pt-4">
                  <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="size-4" />
                    Delete lead
                  </Button>
                  <p className="mt-2 text-xs text-neutral-500">
                    Deleting is permanent and removes the timeline. Marking the lead lost
                    or spam keeps the history.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={submitNote} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Label htmlFor="note-type" className="text-xs text-neutral-600">
                  Type
                </Label>
                <Select
                  id="note-type"
                  value={noteType}
                  onChange={(event) =>
                    setNoteType(event.target.value as (typeof MANUAL_ACTIVITY_TYPES)[number])
                  }
                  options={MANUAL_ACTIVITY_TYPES.map((type) => ({
                    value: type,
                    label: type === "CALL" ? "Call" : "Note",
                  }))}
                />
              </div>
              <div className="min-w-64 flex-1">
                <Label htmlFor="note-body" className="text-xs text-neutral-600">
                  What happened?
                </Label>
                <Input
                  id="note-body"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Called, asked about fees; will visit on Saturday"
                  maxLength={2000}
                />
              </div>
              <Button type="submit" size="sm" disabled={busy || !noteBody.trim()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Add to timeline
              </Button>
            </div>
          </form>

          {lead.activities.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {lead.activities.map((activity) => (
                <li
                  key={activity.id}
                  className={cn(
                    "rounded-xl border border-neutral-200 p-3",
                    activity.type === "NOTE" && "bg-neutral-50"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <Badge variant={activity.type === "NOTE" ? "default" : "outline"}>
                      {ACTIVITY_LABELS[activity.type] ?? activity.type}
                    </Badge>
                    <span>{formatDateTime(activity.createdAt)}</span>
                    {activity.actorName && <span>· {activity.actorName}</span>}
                  </div>
                  {activity.body && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-800">
                      {activity.body}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was this lead lost?</DialogTitle>
            <DialogDescription>
              The reason is required and stored on the lead so the team can learn from it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="detail-lost-reason">Reason</Label>
            <Textarea
              id="detail-lost-reason"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              placeholder="Chose another institute"
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy || !lostReason.trim()} onClick={confirmLost}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Mark as lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this lead?</DialogTitle>
            <DialogDescription>
              This permanently removes {lead.fullName} and the whole activity timeline.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={runDelete}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
