import "server-only";
import { db } from "../db";
import { cached } from "../cache";
import {
  Prisma,
  type LeadSource,
  type LeadStatus,
  type PreferredBatch,
  type Role,
} from "../../generated/prisma/client";
import { leadScopeWhere, type LeadScope } from "./leads";
import { can } from "../permissions";
import {
  endOfKathmanduDay,
  dayKeyLabel,
  kathmanduDayKey,
  startOfKathmanduDay,
} from "@/lib/format";
import {
  DASHBOARD_TTL,
  FUNNEL_STATUS_ORDER,
  LEAD_SOURCE_LABELS,
  PREFERRED_BATCH_LABELS,
  buildDailySeries,
  percentChange,
  type DailyPoint,
  type DashboardRange,
  type FunnelStatus,
} from "@/lib/validators/dashboard";
import { LEAD_STATUS_LABELS } from "@/lib/validators/lead";

/**
 * Dashboard aggregates (docs/05 §5).
 *
 * Rules that apply to every widget here:
 *
 *  - Numbers are computed on the server and handed to client charts as plain
 *    JSON. No chart ever queries the database.
 *  - Dates leave this module as ISO strings; charts receive `YYYY-MM-DD` day
 *    keys in Kathmandu time so a lead created at 23:30 local counts for that
 *    day, not the next one.
 *  - Each widget is cached on its own (1–5 minutes, `DASHBOARD_TTL`) and tagged
 *    `dashboard`, which `LEAD_TAGS` / `MESSAGE_TAGS`
 *    already invalidate — so a status change refreshes the numbers immediately
 *    instead of waiting out the timer.
 *  - Counselor scoping is applied in the query (`leadScopeWhere`), never in the
 *    UI: an EDITOR gets no lead data at all and a COUNSELOR only ever sees their
 *    own leads plus the unassigned queue.
 */

export const DASHBOARD_TAGS = ["dashboard"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that can no longer need a follow-up (docs/05 §5 KPI table). */
const CLOSED_STATUSES: LeadStatus[] = ["ENROLLED", "LOST", "SPAM"];

export type DashboardVariant = "full" | "counselor" | "content";

/**
 * docs/05 §5 "Role variants": COUNSELOR sees lead numbers scoped to their own
 * leads, EDITOR sees content health only, everyone else sees everything.
 */
export function dashboardVariant(role: Role): DashboardVariant {
  if (role === "COUNSELOR") return "counselor";
  if (role === "EDITOR") return "content";
  return "full";
}

function rangeStart(rangeDays: DashboardRange, now: Date): Date {
  return new Date(now.getTime() - rangeDays * DAY_MS);
}

/* ──────────────────────────────────── KPIs ──────────────────────────────────── */

export type NewLeadsKpi = {
  today: number;
  last7: number;
  last30: number;
  /** vs. the previous 7 / 30 days; `null` when the previous window was empty. */
  changePct7: number | null;
  changePct30: number | null;
};

export type DashboardKpisWidget = {
  newLeads: NewLeadsKpi;
  unassigned: number;
  followUpsDue: number;
};

/** Lead-only KPIs. Cached for a minute — these are the numbers staff act on. */
export const getDashboardKpis = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope): Promise<DashboardKpisWidget> => {
    const now = new Date();
    const scopeWhere = leadScopeWhere(scope);
    const todayStart = startOfKathmanduDay(now);
    const day7 = new Date(now.getTime() - 7 * DAY_MS);
    const prevDay7 = new Date(now.getTime() - 14 * DAY_MS);
    const day30 = new Date(now.getTime() - 30 * DAY_MS);
    const prevDay30 = new Date(now.getTime() - 60 * DAY_MS);

    const createdBetween = (from: Date, to: Date) => ({
      AND: [scopeWhere, { createdAt: { gte: from, lt: to } }],
    });

    const [today, last7, prev7, last30, prev30, unassigned, followUpsDue] =
      await Promise.all([
        db.lead.count({ where: createdBetween(todayStart, now) }),
        db.lead.count({ where: createdBetween(day7, now) }),
        db.lead.count({ where: createdBetween(prevDay7, day7) }),
        db.lead.count({ where: createdBetween(day30, now) }),
        db.lead.count({ where: createdBetween(prevDay30, day30) }),
        db.lead.count({
          where: { AND: [scopeWhere, { status: "NEW", assignedToId: null }] },
        }),
        db.lead.count({
          where: {
            AND: [
              scopeWhere,
              { followUpAt: { not: null, lte: endOfKathmanduDay(now) } },
              { status: { notIn: CLOSED_STATUSES } },
            ],
          },
        }),
      ]);

    return {
      newLeads: {
        today,
        last7,
        last30,
        changePct7: percentChange(last7, prev7),
        changePct30: percentChange(last30, prev30),
      },
      unassigned,
      followUpsDue,
    };
  },
  DASHBOARD_TTL.leads
);

/** Conversion is scoped to the selected range; kept out of the KPI widget. */
export const getConversionKpi = cached(
  DASHBOARD_TAGS,
  async (
    scope: LeadScope,
    rangeDays: DashboardRange
  ): Promise<{ enrolled: number; nonSpam: number; ratePct: number | null }> => {
    const now = new Date();
    const where = {
      AND: [
        leadScopeWhere(scope),
        { createdAt: { gte: rangeStart(rangeDays, now), lt: now } },
      ],
    };
    const [enrolled, nonSpam] = await Promise.all([
      db.lead.count({ where: { AND: [where, { status: "ENROLLED" }] } }),
      db.lead.count({ where: { AND: [where, { status: { not: "SPAM" } }] } }),
    ]);
    return {
      enrolled,
      nonSpam,
      ratePct: nonSpam === 0 ? null : (enrolled / nonSpam) * 100,
    };
  },
  DASHBOARD_TTL.leads
);

/** Unread contact messages, only for roles with `contact.read`. */
export const getUnreadMessages = cached(
  DASHBOARD_TAGS,
  async (): Promise<number> => db.contactMessage.count({ where: { status: "NEW" } }),
  DASHBOARD_TTL.audience
);

/* ─────────────────────────────────── charts ─────────────────────────────────── */

/**
 * The one raw query in the module (docs/05 §5): per-day lead counts, bucketed in
 * campus time. `date_trunc` needs the `AT TIME ZONE` because `createdAt` is a
 * `timestamptz` — without it the buckets would follow the server's timezone.
 *
 * The day is returned as `YYYY-MM-DD` text rather than a timestamp because the
 * pg driver would hand a zone-less timestamp back as a JS `Date` in the
 * *server's* local time, quietly shifting every point by a day.
 */
export function leadsPerDayQuery(
  scope: LeadScope,
  from: Date,
  to: Date
): Prisma.Sql {
  const roleScope =
    scope.role === "COUNSELOR"
      ? Prisma.sql`AND ("assignedToId" = ${scope.userId} OR "assignedToId" IS NULL)`
      : Prisma.empty;

  return Prisma.sql`
    SELECT
      to_char(date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kathmandu'), 'YYYY-MM-DD') AS day,
      count(*)::bigint AS count
    FROM "Lead"
    WHERE "createdAt" >= ${from}
      AND "createdAt" < ${to}
      ${roleScope}
    GROUP BY 1
    ORDER BY 1
  `;
}

export type LeadsPerDayWidget = { days: DashboardRange; points: DailyPoint[] };

export const getLeadsPerDay = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope, rangeDays: DashboardRange): Promise<LeadsPerDayWidget> => {
    const to = new Date();
    const from = rangeStart(rangeDays, to);
    const rows = await db.$queryRaw<{ day: string; count: bigint }[]>(
      leadsPerDayQuery(scope, from, to)
    );
    return {
      days: rangeDays,
      points: buildDailySeries(
        rows,
        kathmanduDayKey(from),
        kathmanduDayKey(to),
        dayKeyLabel
      ),
    };
  },
  DASHBOARD_TTL.leads
);

export type FunnelPoint = { status: FunnelStatus; label: string; count: number };

export const getPipelineFunnel = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope): Promise<FunnelPoint[]> => {
    const grouped = await db.lead.groupBy({
      by: ["status"],
      where: leadScopeWhere(scope),
      _count: { _all: true },
    });
    const countByStatus = new Map<string, number>();
    for (const row of grouped) countByStatus.set(row.status, row._count._all);
    return FUNNEL_STATUS_ORDER.map((status) => ({
      status,
      label: LEAD_STATUS_LABELS[status],
      count: countByStatus.get(status) ?? 0,
    }));
  },
  DASHBOARD_TTL.leads
);

export type CourseEnquiryPoint = {
  courseId: string | null;
  title: string;
  count: number;
};

/**
 * Top courses by enquiries (docs/05 §5 chart 3). Grouped by the `courseTitle`
 * snapshot as well as the id, so a course that was renamed or archived since the
 * enquiry still reads correctly (docs/03 §3).
 */
export const getTopCoursesByEnquiries = cached(
  DASHBOARD_TAGS,
  async (
    scope: LeadScope,
    rangeDays: DashboardRange,
    limit = 10
  ): Promise<CourseEnquiryPoint[]> => {
    const now = new Date();
    const grouped = await db.lead.groupBy({
      by: ["courseId", "courseTitle"],
      where: {
        AND: [
          leadScopeWhere(scope),
          { createdAt: { gte: rangeStart(rangeDays, now), lt: now } },
        ],
      },
      _count: { _all: true },
      orderBy: { _count: { courseId: "desc" } },
      take: limit,
    });

    const points = grouped.map((row) => ({
      courseId: row.courseId,
      title: row.courseTitle ?? "No course chosen",
      count: row._count._all,
    }));

    // The snapshot can be empty for a lead created before titles were stored.
    const missingIds = points
      .filter((point) => point.courseId && point.title === "No course chosen")
      .map((point) => point.courseId as string);
    if (missingIds.length > 0) {
      const courses = await db.course.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, title: true },
      });
      const titleById = new Map(courses.map((course) => [course.id, course.title]));
      for (const point of points) {
        if (point.courseId) point.title = titleById.get(point.courseId) ?? point.title;
      }
    }
    return points;
  },
  DASHBOARD_TTL.leads
);

export type SourceWidget = {
  sources: { source: LeadSource; label: string; count: number }[];
  campaigns: { campaign: string; count: number }[];
};

export const getLeadsBySource = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope, rangeDays: DashboardRange): Promise<SourceWidget> => {
    const now = new Date();
    const where = {
      AND: [
        leadScopeWhere(scope),
        { createdAt: { gte: rangeStart(rangeDays, now), lt: now } },
      ],
    };

    const [bySource, byCampaign] = await Promise.all([
      db.lead.groupBy({
        by: ["source"],
        where,
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
      }),
      db.lead.groupBy({
        by: ["utmCampaign"],
        where: { AND: [where, { utmCampaign: { not: null } }] },
        _count: { _all: true },
        orderBy: { _count: { utmCampaign: "desc" } },
        take: 5,
      }),
    ]);

    return {
      sources: bySource.map((row) => ({
        source: row.source,
        label: LEAD_SOURCE_LABELS[row.source] ?? row.source,
        count: row._count._all,
      })),
      campaigns: byCampaign.map((row) => ({
        campaign: row.utmCampaign as string,
        count: row._count._all,
      })),
    };
  },
  DASHBOARD_TTL.leads
);

export type BatchPoint = {
  batch: PreferredBatch;
  label: string;
  count: number;
};

export const getEnquiriesByBatch = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope, rangeDays: DashboardRange): Promise<BatchPoint[]> => {
    const now = new Date();
    const grouped = await db.lead.groupBy({
      by: ["preferredBatch"],
      where: {
        AND: [
          leadScopeWhere(scope),
          { createdAt: { gte: rangeStart(rangeDays, now), lt: now } },
        ],
      },
      _count: { _all: true },
    });
    const countByBatch = new Map<string, number>();
    for (const row of grouped) countByBatch.set(row.preferredBatch, row._count._all);

    return (Object.keys(PREFERRED_BATCH_LABELS) as PreferredBatch[])
      .filter((batch) => countByBatch.has(batch))
      .map((batch) => ({
        batch,
        label: PREFERRED_BATCH_LABELS[batch],
        count: countByBatch.get(batch) ?? 0,
      }));
  },
  DASHBOARD_TTL.leads
);

/* ──────────────────────────────────── lists ──────────────────────────────────── */

export type DashboardLeadRow = {
  id: string;
  fullName: string;
  courseTitle: string | null;
  status: LeadStatus;
  assigneeName: string | null;
  createdAt: string;
};

/** Latest 10 leads (docs/05 §5 lists). No phone or message body — click through. */
export const getLatestLeads = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope, limit = 10): Promise<DashboardLeadRow[]> => {
    const rows = await db.lead.findMany({
      where: leadScopeWhere(scope),
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        fullName: true,
        courseTitle: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      courseTitle: row.courseTitle,
      status: row.status,
      assigneeName: row.assignedTo?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  },
  DASHBOARD_TTL.leads
);

export type FollowUpRow = {
  id: string;
  fullName: string;
  phone: string;
  courseTitle: string | null;
  followUpAt: string;
  status: LeadStatus;
  assigneeName: string | null;
};

/**
 * Overdue and due-today follow-ups. This list is the one place the dashboard
 * shows a phone number, because the row carries call/WhatsApp buttons
 * (docs/05 §5 lists) — no message bodies or e-mail addresses.
 */
export const getFollowUpsDue = cached(
  DASHBOARD_TAGS,
  async (scope: LeadScope, limit = 10): Promise<FollowUpRow[]> => {
    const now = new Date();
    const rows = await db.lead.findMany({
      where: {
        AND: [
          leadScopeWhere(scope),
          { followUpAt: { not: null, lte: endOfKathmanduDay(now) } },
          { status: { notIn: CLOSED_STATUSES } },
        ],
      },
      orderBy: { followUpAt: "asc" },
      take: limit,
      select: {
        id: true,
        fullName: true,
        phone: true,
        courseTitle: true,
        followUpAt: true,
        status: true,
        assignedTo: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      courseTitle: row.courseTitle,
      followUpAt: (row.followUpAt as Date).toISOString(),
      status: row.status,
      assigneeName: row.assignedTo?.name ?? null,
    }));
  },
  DASHBOARD_TTL.leads
);

export type UpcomingEventRow = {
  id: string;
  title: string;
  startsAt: string;
  location: string;
};

/** Next 3 published events (docs/05 §5 lists). */
export const getUpcomingEvents = cached(
  DASHBOARD_TAGS,
  async (limit = 3): Promise<UpcomingEventRow[]> => {
    const rows = await db.event.findMany({
      where: { status: "PUBLISHED", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: limit,
      select: { id: true, title: true, startsAt: true, location: true },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      location: row.location,
    }));
  },
  DASHBOARD_TTL.content
);

export type ContentAttention = {
  staleCourseDrafts: number;
  stalePostDrafts: number;
  unpublishedFaqs: number;
  unpublishedTestimonials: number;
  publishedCoursesMissingCover: number;
  publishedCoursesMissingSeo: number;
};

/**
 * "Content needing attention" (docs/05 §5 lists): stale drafts and rows that
 * would look broken on the public site. Five grouped counts, not five list
 * queries — the page only needs the numbers plus a link to each module.
 */
export const getContentAttention = cached(
  DASHBOARD_TAGS,
  async (): Promise<ContentAttention> => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * DAY_MS);
    const [staleCourseDrafts, stalePostDrafts, unpublishedFaqs, unpublishedTestimonials, coverRows, seoRows] =
      await Promise.all([
        db.course.count({
          where: { status: "DRAFT", createdAt: { lte: fourteenDaysAgo } },
        }),
        db.blogPost.count({
          where: { status: "DRAFT", createdAt: { lte: fourteenDaysAgo } },
        }),
        db.faq.count({ where: { isPublished: false } }),
        db.testimonial.count({ where: { isPublished: false } }),
        db.course.count({ where: { status: "PUBLISHED", coverId: null } }),
        db.course.count({
          where: {
            status: "PUBLISHED",
            OR: [{ seoTitle: null }, { seoDescription: null }],
          },
        }),
      ]);

    return {
      staleCourseDrafts,
      stalePostDrafts,
      unpublishedFaqs,
      unpublishedTestimonials,
      publishedCoursesMissingCover: coverRows,
      publishedCoursesMissingSeo: seoRows,
    };
  },
  DASHBOARD_TTL.content
);

/* ──────────────────────────────── orchestration ──────────────────────────────── */

export type DashboardCharts = {
  leadsPerDay: LeadsPerDayWidget;
  funnel: FunnelPoint[];
  topCourses: CourseEnquiryPoint[];
  sources: SourceWidget;
  batches: BatchPoint[];
};

export type DashboardLists = {
  latestLeads: DashboardLeadRow[];
  followUpsDue: FollowUpRow[];
};

export type DashboardData = {
  variant: DashboardVariant;
  range: DashboardRange;
  kpis: DashboardKpisWidget & {
    conversionRange: { enrolled: number; nonSpam: number; ratePct: number | null };
    unreadMessages: number | null;
  } | null;
  charts: DashboardCharts | null;
  lists: DashboardLists | null;
  content: { events: UpcomingEventRow[]; attention: ContentAttention } | null;
};

/**
 * Assembles the widgets a role is allowed to see. Each widget is already cached
 * on its own, so this only decides *which* of them to call.
 */
export async function getDashboardData(
  scope: LeadScope,
  range: DashboardRange
): Promise<DashboardData> {
  const variant = dashboardVariant(scope.role);
  const content = {
    events: await getUpcomingEvents(),
    attention: await getContentAttention(),
  };

  if (variant === "content") {
    return { variant, range, kpis: null, charts: null, lists: null, content };
  }

  const [kpis, conversionRange, leadsPerDay, funnel, topCourses, sources, batches, latestLeads, followUpsDue] =
    await Promise.all([
      getDashboardKpis(scope),
      getConversionKpi(scope, range),
      getLeadsPerDay(scope, range),
      getPipelineFunnel(scope),
      getTopCoursesByEnquiries(scope, range),
      getLeadsBySource(scope, range),
      getEnquiriesByBatch(scope, range),
      getLatestLeads(scope),
      getFollowUpsDue(scope),
    ]);

  const canReadMessages = can(scope.role, "contact.read");

  return {
    variant,
    range,
    kpis: {
      ...kpis,
      conversionRange,
      unreadMessages: canReadMessages ? await getUnreadMessages() : null,
    },
    charts: { leadsPerDay, funnel, topCourses, sources, batches },
    lists: { latestLeads, followUpsDue },
    content,
  };
}
