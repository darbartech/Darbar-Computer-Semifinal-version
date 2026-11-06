import { NextRequest, NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit } from "@/server/services/audit";
import { listLeadsForExport, type LeadListRow } from "@/server/dal/leads";
import {
  LEAD_EXPORT_MAX_ROWS,
  leadFilterSchema,
  resolveLeadExportRange,
} from "@/lib/validators/lead";
import { csvDocument, csvFilename } from "@/lib/csv";
import { fmtDateTime } from "@/lib/dates";
import { kathmanduDayKey } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/techdarbar/leads/export (docs/06 §10, fix guide §11)
 *
 * Streams the filtered lead list as CSV and writes one audit entry for the
 * download. Three things are deliberate:
 *
 * - The window is required. No `from`/`to` means the last
 *   `LEAD_EXPORT_MAX_RANGE_DAYS` days, and a wider span is refused rather than
 *   silently clipped — a file that looks complete but is not is worse than an
 *   error telling you to narrow the range.
 * - Cells are escaped against formula injection, because names and campaign
 *   tags are typed by strangers and opened by staff in Excel.
 * - The audit row records the filter shape and the count, never the search
 *   text, which is usually a phone number or an address (docs/08 §1).
 */

const HEADER = [
  "Enquired",
  "Name",
  "Phone",
  "Email",
  "Course",
  "Preferred batch",
  "Source",
  "Status",
  "Assignee",
  "Campaign",
  "Follow up",
];

function line(row: LeadListRow): (string | null)[] {
  return [
    fmtDateTime(row.createdAt),
    row.fullName,
    row.phone,
    row.email,
    row.courseTitle,
    row.preferredBatch,
    row.source,
    row.status,
    row.assigneeName,
    row.utmCampaign,
    row.followUpAt ? fmtDateTime(row.followUpAt) : null,
  ];
}

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("lead.export");

    const raw = Object.fromEntries(
      Array.from(request.nextUrl.searchParams.entries()).filter(
        ([, value]) => value !== ""
      )
    );
    const parsed = leadFilterSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That filter combination is not valid." },
        { status: 400 }
      );
    }
    const filters = parsed.data;

    const range = resolveLeadExportRange(filters);
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const { rows, truncated } = await listLeadsForExport(
      { ...filters, from: range.from.toISOString(), to: range.to.toISOString() },
      { userId: user.id, role: user.role }
    );

    const body = csvDocument(
      HEADER,
      truncated
        ? [
            ...rows.map(line),
            [
              `Only the first ${LEAD_EXPORT_MAX_ROWS} rows are included. Narrow the date range and export again.`,
            ],
          ]
        : rows.map(line)
    );

    await audit({
      actor: { id: user.id, email: user.email },
      action: "lead.export",
      entity: "Lead",
      entityId: null,
      summary: `Exported ${rows.length} lead${rows.length === 1 ? "" : "s"} as CSV`,
      meta: {
        rows: rows.length,
        truncated,
        windowDays: Math.round(
          (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000)
        ),
        windowDefaulted: range.windowDefaulted,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        // The shape of the request, not its content: `q` is left out because it
        // is normally a phone number or an email address.
        view: filters.view,
        status: filters.status ?? null,
        course: filters.course ?? null,
        source: filters.source ?? null,
        assignee: filters.assignee ?? null,
        followUpDue: filters.followUpDue,
      },
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename("leads", kathmanduDayKey())}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
        "X-Leads-Export-Truncated": truncated ? "true" : "false",
      },
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      "[leads.export]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
