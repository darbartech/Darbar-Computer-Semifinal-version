"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MessageSquare,
  Phone,
  Search,
  Trash2,
  UserCheck,
  Filter,
  Download,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
  assignLead,
  hardDeleteLeads,
  runBulkLeadAction,
  updateLeadStatus,
} from "@/server/actions/leads";
import {
  LEAD_EXPORT_MAX_RANGE_DAYS,
  LEAD_PAGE_SIZE,
  LEAD_STATUS_FLOW,
  LEAD_STATUS_LABELS,
  type LeadFilters,
} from "@/lib/validators/lead";
import { LEAD_SOURCES, PREFERRED_BATCH_OPTIONS } from "@/lib/validators/shared";
import type { LeadCountsByStatus, LeadListRow } from "@/server/dal/leads";
import { formatDate, toDialablePhone, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LeadsTableProps = {
  rows: LeadListRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: LeadCountsByStatus;
  filters: LeadFilters;
  assignees: { id: string; name: string }[];
  courses: { slug: string; title: string }[];
  canDelete: boolean;
  /** Renders the CSV download, which the server still has to authorise. */
  canExport: boolean;
};

const VIEWS = [
  { value: "new", label: "New" },
  { value: "mine", label: "My leads" },
  { value: "follow-up-today", label: "Follow-up today" },
  { value: "all", label: "All" },
  { value: "spam", label: "Spam" },
] as const;

const SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  WEBSITE_INQUIRY: "Website inquiry",
  CONTACT_FORM: "Contact form",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  EVENT: "Event",
  REFERRAL: "Referral",
  OTHER: "Other",
};

const BATCH_LABELS: Record<string, string> = Object.fromEntries(
  PREFERRED_BATCH_OPTIONS.map((option) => [option.value, option.label])
);

function buildQuery(filters: LeadFilters, overrides: Partial<Record<string, string>> = {}) {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    view: filters.view,
    q: filters.q,
    status: filters.status,
    course: filters.course,
    source: filters.source,
    campaign: filters.campaign,
    assignee: filters.assignee,
    from: filters.from,
    to: filters.to,
    sort: filters.sort === "createdAt" ? undefined : filters.sort,
    dir: filters.dir === "desc" ? undefined : filters.dir,
    followUpDue: filters.followUpDue ? "true" : undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  return params;
}

export function LeadsTable({
  rows,
  total,
  page,
  pageCount,
  counts,
  filters,
  assignees,
  courses,
  canDelete,
  canExport,
}: LeadsTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [search, setSearch] = React.useState(filters.q ?? "");
  const [statusDraft, setStatusDraft] = React.useState(filters.status ?? "");
  const [courseDraft, setCourseDraft] = React.useState(filters.course ?? "");
  const [sourceDraft, setSourceDraft] = React.useState(filters.source ?? "");
  const [campaignDraft, setCampaignDraft] = React.useState(filters.campaign ?? "");
  const [assigneeDraft, setAssigneeDraft] = React.useState(filters.assignee ?? "");
  const [fromDraft, setFromDraft] = React.useState(filters.from ?? "");
  const [toDraft, setToDraft] = React.useState(filters.to ?? "");
  const [dueDraft, setDueDraft] = React.useState(filters.followUpDue);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [bulkAssignee, setBulkAssignee] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [lostLead, setLostLead] = React.useState<LeadListRow | null>(null);
  const [lostReason, setLostReason] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const params = buildQuery(filters, {
      q: search.trim() || undefined,
      status: statusDraft || undefined,
      course: courseDraft || undefined,
      source: sourceDraft || undefined,
      campaign: campaignDraft.trim() || undefined,
      assignee: assigneeDraft || undefined,
      from: fromDraft || undefined,
      to: toDraft || undefined,
      followUpDue: dueDraft ? "true" : undefined,
      page: undefined,
    });
    router.push(`/techdarbar/leads?${params}`);
  };

  const clearFilters = () => {
    router.push(`/techdarbar/leads?${buildQuery(
      { ...filters, view: "all", q: undefined },
      {
        q: undefined,
        status: undefined,
        course: undefined,
        source: undefined,
        campaign: undefined,
        assignee: undefined,
        from: undefined,
        to: undefined,
        followUpDue: undefined,
      }
    )}`);
  };

  const switchView = (view: string) => {
    router.push(`/techdarbar/leads?${buildQuery(filters, { view, page: undefined })}`);
  };

  const goToPage = (next: number) => {
    router.push(`/techdarbar/leads?${buildQuery(filters, { page: next > 1 ? String(next) : undefined })}`);
  };

  /**
   * The download carries the filters in the form, not the ones last applied —
   * picking a month and pressing Export should not quietly export the whole
   * view that is still on screen. The route re-checks permission and caps the
   * window; this only decides what is asked for.
   */
  const exportQuery = buildQuery(filters, {
    q: search.trim() || undefined,
    status: statusDraft || undefined,
    course: courseDraft || undefined,
    source: sourceDraft || undefined,
    campaign: campaignDraft.trim() || undefined,
    assignee: assigneeDraft || undefined,
    from: fromDraft || undefined,
    to: toDraft || undefined,
    followUpDue: dueDraft ? "true" : undefined,
    sort: undefined,
    dir: undefined,
    page: undefined,
  }).toString();

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  const changeStatus = async (row: LeadListRow, status: string) => {
    if (status === "LOST") {
      setLostLead(row);
      setLostReason("");
      return;
    }
    setBusyId(row.id);
    const result = await updateLeadStatus({ id: row.id, status });
    setBusyId(null);
    if (!result.ok) {
      toast({ title: "Could not update status", description: result.error, variant: "error" });
      return;
    }
    toast({ title: `Marked as ${LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS]}`, variant: "success" });
    router.refresh();
  };

  const confirmLost = async () => {
    if (!lostLead) return;
    setBusy(true);
    const result = await updateLeadStatus({
      id: lostLead.id,
      status: "LOST",
      lostReason: lostReason.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not mark as lost", description: result.error, variant: "error" });
      return;
    }
    setLostLead(null);
    toast({ title: "Marked as lost", variant: "success" });
    router.refresh();
  };

  const changeAssignee = async (row: LeadListRow, assigneeId: string) => {
    setBusyId(row.id);
    const result = await assignLead({ id: row.id, assigneeId: assigneeId || null });
    setBusyId(null);
    if (!result.ok) {
      toast({ title: "Could not assign", description: result.error, variant: "error" });
      return;
    }
    router.refresh();
  };

  const runBulk = async (action: "assign" | "spam" | "unassign") => {
    if (selected.length === 0) return;
    setBusy(true);
    const result = await runBulkLeadAction({
      ids: selected,
      action,
      assigneeId: action === "assign" ? bulkAssignee : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Bulk action failed", description: result.error, variant: "error" });
      return;
    }
    toast({
      title: `${result.data.updated} lead${result.data.updated === 1 ? "" : "s"} updated`,
      variant: "success",
    });
    setSelected([]);
    router.refresh();
  };

  const runDelete = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    const result = await hardDeleteLeads({ ids: selected });
    setBusy(false);
    if (!result.ok) {
      toast({ title: "Could not delete", description: result.error, variant: "error" });
      return;
    }
    setConfirmDelete(false);
    setSelected([]);
    toast({ title: `${result.data.deleted} lead(s) deleted`, variant: "success" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200">
        {VIEWS.map((view) => {
          const active = filters.view === view.value;
          const count =
            view.value === "new"
              ? counts.NEW
              : view.value === "spam"
                ? counts.SPAM
                : null;
          return (
            <button
              key={view.value}
              type="button"
              onClick={() => switchView(view.value)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-600 hover:text-neutral-900"
              )}
            >
              {view.label}
              {count !== null && (
                <span className="ml-1.5 text-xs text-neutral-500">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="lead-q" className="text-xs text-neutral-600">
                Search name / phone / email
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="lead-q"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ram, 9800000000, ram@…"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-status" className="text-xs text-neutral-600">Status</Label>
              <Select
                id="lead-status"
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
                options={[
                  { value: "", label: "Any status" },
                  ...LEAD_STATUS_FLOW.map((status) => ({
                    value: status,
                    label: LEAD_STATUS_LABELS[status],
                  })),
                  { value: "LOST", label: LEAD_STATUS_LABELS.LOST },
                  { value: "SPAM", label: LEAD_STATUS_LABELS.SPAM },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-course" className="text-xs text-neutral-600">Course</Label>
              <Select
                id="lead-course"
                value={courseDraft}
                onChange={(event) => setCourseDraft(event.target.value)}
                options={[
                  { value: "", label: "Any course" },
                  ...courses.map((course) => ({ value: course.slug, label: course.title })),
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-source" className="text-xs text-neutral-600">Source</Label>
              <Select
                id="lead-source"
                value={sourceDraft}
                onChange={(event) => setSourceDraft(event.target.value)}
                options={[
                  { value: "", label: "Any source" },
                  ...LEAD_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] })),
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-assignee" className="text-xs text-neutral-600">Assignee</Label>
              <Select
                id="lead-assignee"
                value={assigneeDraft}
                onChange={(event) => setAssigneeDraft(event.target.value)}
                options={[
                  { value: "", label: "Anyone" },
                  { value: "unassigned", label: "Unassigned" },
                  ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-from" className="text-xs text-neutral-600">Created from</Label>
              <Input id="lead-from" type="date" value={fromDraft} onChange={(event) => setFromDraft(event.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-to" className="text-xs text-neutral-600">Created to</Label>
              <Input id="lead-to" type="date" value={toDraft} onChange={(event) => setToDraft(event.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-campaign" className="text-xs text-neutral-600">UTM campaign</Label>
              <Input
                id="lead-campaign"
                value={campaignDraft}
                onChange={(event) => setCampaignDraft(event.target.value)}
                placeholder="spring-2026"
              />
            </div>

            <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={dueDraft}
                  onChange={(event) => setDueDraft(event.target.checked)}
                  className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
                />
                Follow-up due (overdue or today)
              </label>
              <Button type="submit" size="sm">
                <Filter className="size-4" />
                Apply filters
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                Reset
              </Button>
              <span className="ml-auto flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {total} lead{total === 1 ? "" : "s"}
                </span>
                {canExport && (
                  <a
                    href={`/api/techdarbar/leads/export?${exportQuery}`}
                    title={`CSV of these filters. A download covers at most ${LEAD_EXPORT_MAX_RANGE_DAYS} days and is written to the audit log.`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    <Download className="size-4" />
                    Export CSV
                  </a>
                )}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <span className="text-sm font-medium text-neutral-800">
              {selected.length} selected
            </span>
            <div className="flex items-center gap-2">
              <div className="w-48">
                <Select
                  value={bulkAssignee}
                  onChange={(event) => setBulkAssignee(event.target.value)}
                  placeholder="Assign to…"
                  options={assignees.map((assignee) => ({ value: assignee.id, label: assignee.name }))}
                  className="h-10"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkAssignee || busy}
                onClick={() => runBulk("assign")}
              >
                <UserCheck className="size-4" />
                Assign
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => runBulk("unassign")}
              >
                Unassign
              </Button>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk("spam")}>
              Mark spam
            </Button>
            {canDelete && (
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all leads on this page"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? [] : rows.map((row) => row.id))
                      }
                      className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3">Created</th>
                  <th scope="col" className="px-3 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Phone</th>
                  <th scope="col" className="px-3 py-3">Course</th>
                  <th scope="col" className="px-3 py-3">Batch</th>
                  <th scope="col" className="px-3 py-3">Source</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Assignee</th>
                  <th scope="col" className="px-3 py-3">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-12 text-center text-neutral-500">
                      No leads match these filters.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="align-middle hover:bg-neutral-50/70">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.fullName}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                        className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-neutral-600">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/techdarbar/leads/${row.id}`}
                        className="font-medium text-neutral-900 hover:text-primary hover:underline"
                      >
                        {row.fullName}
                      </Link>
                      {row.email && (
                        <div className="text-xs text-neutral-500">{row.email}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${toDialablePhone(row.phone)}`}
                          className="text-neutral-800 hover:text-primary"
                        >
                          {row.phone}
                        </a>
                        <a
                          href={waLink(row.phone)}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`WhatsApp ${row.fullName}`}
                          className="text-neutral-400 hover:text-success"
                        >
                          <MessageSquare className="size-4" />
                        </a>
                        <a
                          href={`tel:${toDialablePhone(row.phone)}`}
                          aria-label={`Call ${row.fullName}`}
                          className="text-neutral-400 hover:text-primary"
                        >
                          <Phone className="size-4" />
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-neutral-700">
                      {row.courseTitle ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-neutral-600">
                      {BATCH_LABELS[row.preferredBatch] ?? row.preferredBatch}
                    </td>
                    <td className="px-3 py-3 text-neutral-600">
                      {SOURCE_LABELS[row.source] ?? row.source}
                      {row.utmCampaign && (
                        <Badge variant="outline" className="ml-1.5">
                          {row.utmCampaign}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <LeadStatusBadge status={row.status} />
                        <div className="w-40">
                          <Select
                            aria-label={`Change status for ${row.fullName}`}
                            value={row.status}
                            disabled={busyId === row.id}
                            onChange={(event) => changeStatus(row, event.target.value)}
                            options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-40">
                        <Select
                          aria-label={`Assign ${row.fullName}`}
                          value={row.assigneeId ?? ""}
                          disabled={busyId === row.id}
                          onChange={(event) => changeAssignee(row, event.target.value)}
                          options={[
                            { value: "", label: "Unassigned" },
                            ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
                          ]}
                          className="h-9 text-xs"
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-neutral-600">
                      {formatDate(row.followUpAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        <span>
          Page {page} of {pageCount} · {LEAD_PAGE_SIZE} per page
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!lostLead} onOpenChange={(open) => !open && setLostLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was this lead lost?</DialogTitle>
            <DialogDescription>
              A reason is required so the team can learn from it. It is stored on the lead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Reason</Label>
            <Input
              id="lost-reason"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              placeholder="Chose another institute"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostLead(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !lostReason.trim()}
              onClick={confirmLost}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Mark as lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.length} lead(s)?</DialogTitle>
            <DialogDescription>
              This permanently removes the leads and their activity history. Marking them as
              lost or spam is reversible and usually the better choice.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
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
