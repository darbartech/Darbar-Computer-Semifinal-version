import "server-only";
import { db } from "@/server/db";
import { ADMIN_PICKER_LIMIT } from "@/server/constants";
import type {
  Lead,
  LeadActivityType,
  Prisma,
  Role,
} from "@/generated/prisma/client";
import {
  LEAD_EXPORT_MAX_ROWS,
  LEAD_PAGE_SIZE,
  type LeadFilters,
} from "@/lib/validators/lead";

/** A phone number that enquired within this window is treated as a duplicate. */
export const DUPLICATE_WINDOW_DAYS = 7;

export type CreateLeadFromInquiryInput = {
  fullName: string;
  phone: string;
  email: string | null;
  courseId: string | null;
  courseTitle: string | null;
  preferredBatch: Lead["preferredBatch"];
  message: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerUrl: string | null;
  consentAt: Date;
  ipHash: string;
};

export type CreateLeadResult = {
  lead: Lead;
  isDuplicate: boolean;
  duplicateCount: number;
};

/**
 * Stores a public inquiry. A repeated phone number inside
 * `DUPLICATE_WINDOW_DAYS` is still stored — the visitor may genuinely change
 * their mind — but it is flagged so staff can merge it (docs/04 §2.1).
 */
export async function createLeadFromInquiry(
  input: CreateLeadFromInquiryInput
): Promise<CreateLeadResult> {
  const windowStart = new Date(
    Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const recentDuplicates = await db.lead.findMany({
    where: { phone: input.phone, createdAt: { gte: windowStart } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const lead = await db.lead.create({
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      courseId: input.courseId,
      courseTitle: input.courseTitle,
      preferredBatch: input.preferredBatch,
      message: input.message,
      source: "WEBSITE_INQUIRY",
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      referrerUrl: input.referrerUrl,
      consentAt: input.consentAt,
      ipHash: input.ipHash,
    },
  });

  if (recentDuplicates.length > 0) {
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "NOTE",
        body:
          recentDuplicates.length === 1
            ? "Duplicate enquiry: the same phone number already enquired in the last 7 days."
            : `Duplicate enquiry: the same phone number has enquired ${recentDuplicates.length} times in the last 7 days.`,
        meta: {
          duplicateLeadIds: recentDuplicates.map((row) => row.id),
        },
      },
    });
  }

  return {
    lead,
    isDuplicate: recentDuplicates.length > 0,
    duplicateCount: recentDuplicates.length,
  };
}

/** Resolves the public course slug to the stored course, if it is published. */
export async function findPublishedCourseBySlug(slug: string) {
  return db.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, title: true },
  });
}

export type LeadCountsByStatus = Record<Lead["status"], number>;

/** Who is asking. Drives the counselor scope in the DAL, not the UI. */
export type LeadScope = {
  userId: string;
  role: Role;
};

/**
 * docs/05 §4.1: "Counselors cannot see leads assigned to others (enforced in
 * the DAL query, not only in the UI)". A counselor sees their own leads plus
 * the unassigned queue.
 *
 * This is also where an anonymised lead disappears from the whole application.
 * The retention job (task 9) strips a stranger's enquiry and stamps `deletedAt`
 * instead of deleting the row, so a purge that was wrong can be undone by
 * clearing the stamp — and every list, badge, chart, export and detail read that
 * shares this predicate stops showing it the moment that happens.
 */
export function leadScopeWhere(scope: LeadScope): Prisma.LeadWhereInput {
  const notPurged = { deletedAt: null };
  if (scope.role === "COUNSELOR") {
    return {
      AND: [notPurged, { OR: [{ assignedToId: scope.userId }, { assignedToId: null }] }],
    };
  }
  return notPurged;
}

function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Builds the `where` clause shared by the list page and the CSV export. */
export function leadWhere(
  filters: LeadFilters,
  scope: LeadScope
): Prisma.LeadWhereInput {
  const conditions: Prisma.LeadWhereInput[] = [leadScopeWhere(scope)];

  if (filters.view === "new") {
    conditions.push({ status: "NEW" });
  } else if (filters.view === "mine") {
    conditions.push({ assignedToId: scope.userId });
  } else if (filters.view === "follow-up-today") {
    conditions.push({
      followUpAt: { not: null, lte: endOfToday(), gte: startOfToday() },
    });
  } else if (filters.view === "spam") {
    conditions.push({ status: "SPAM" });
  } else if (filters.status) {
    conditions.push({ status: filters.status });
  }

  if (filters.q) {
    conditions.push({
      OR: [
        { fullName: { contains: filters.q, mode: "insensitive" } },
        { phone: { contains: filters.q } },
        { email: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  if (filters.course) conditions.push({ course: { slug: filters.course } });
  if (filters.source) conditions.push({ source: filters.source });
  if (filters.campaign) {
    conditions.push({ utmCampaign: { contains: filters.campaign, mode: "insensitive" } });
  }
  if (filters.assignee === "unassigned") conditions.push({ assignedToId: null });
  else if (filters.assignee) conditions.push({ assignedToId: filters.assignee });
  if (filters.followUpDue) conditions.push({ followUpAt: { not: null, lte: endOfToday() } });

  const from = parseDate(filters.from);
  const to = parseDate(filters.to);
  if (from || to) {
    conditions.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }

  return { AND: conditions };
}

function leadOrderBy(
  filters: LeadFilters
): Prisma.LeadOrderByWithRelationInput[] {
  const direction = filters.dir === "asc" ? "asc" : "desc";
  switch (filters.sort) {
    case "fullName":
      return [{ fullName: direction }, { createdAt: "desc" }];
    case "status":
      return [{ status: direction }, { createdAt: "desc" }];
    case "followUpAt":
      return [{ followUpAt: direction }, { createdAt: "desc" }];
    default:
      return [{ createdAt: direction }];
  }
}

export type LeadListRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  courseTitle: string | null;
  courseSlug: string | null;
  preferredBatch: Lead["preferredBatch"];
  source: Lead["source"];
  status: Lead["status"];
  assigneeId: string | null;
  assigneeName: string | null;
  utmCampaign: string | null;
  followUpAt: string | null;
  createdAt: string;
};

export type LeadListResult = {
  rows: LeadListRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: LeadCountsByStatus;
};

const listSelect = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  courseTitle: true,
  preferredBatch: true,
  source: true,
  status: true,
  utmCampaign: true,
  followUpAt: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
  course: { select: { slug: true } },
} satisfies Prisma.LeadSelect;

function toListRow(row: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  courseTitle: string | null;
  preferredBatch: Lead["preferredBatch"];
  source: Lead["source"];
  status: Lead["status"];
  utmCampaign: string | null;
  followUpAt: Date | null;
  createdAt: Date;
  assignedTo: { id: string; name: string } | null;
  course: { slug: string } | null;
}): LeadListRow {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    courseTitle: row.courseTitle,
    courseSlug: row.course?.slug ?? null,
    preferredBatch: row.preferredBatch,
    source: row.source,
    status: row.status,
    assigneeId: row.assignedTo?.id ?? null,
    assigneeName: row.assignedTo?.name ?? null,
    utmCampaign: row.utmCampaign,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Admin leads table (docs/05 §4.1). Filters arrive from the URL. */
export async function adminListLeads(
  filters: LeadFilters,
  scope: LeadScope
): Promise<LeadListResult> {
  const where = leadWhere(filters, scope);
  const perPage = LEAD_PAGE_SIZE;
  const page = Math.min(
    Math.max(1, filters.page),
    Math.max(1, Math.ceil((await db.lead.count({ where })) / perPage))
  );

  const [total, rows, counts] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy: leadOrderBy(filters),
      skip: (page - 1) * perPage,
      take: perPage,
      select: listSelect,
    }),
    countLeadsByStatus(leadScopeWhere(scope)),
  ]);

  return {
    rows: rows.map(toListRow),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    counts,
  };
}

export type LeadDetail = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseSlug: string | null;
  preferredBatch: Lead["preferredBatch"];
  message: string | null;
  source: Lead["source"];
  status: Lead["status"];
  lostReason: string | null;
  followUpAt: string | null;
  enrolledAt: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerUrl: string | null;
  consentAt: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  activities: {
    id: string;
    type: LeadActivityType;
    body: string | null;
    createdAt: string;
    actorName: string | null;
  }[];
};

/** Full lead detail with its activity timeline, newest first. */
export async function getLeadDetail(
  id: string,
  scope: LeadScope
): Promise<LeadDetail | null> {
  const row = await db.lead.findFirst({
    where: { AND: [{ id }, leadScopeWhere(scope)] },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      courseId: true,
      courseTitle: true,
      preferredBatch: true,
      message: true,
      source: true,
      status: true,
      lostReason: true,
      followUpAt: true,
      enrolledAt: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      referrerUrl: true,
      consentAt: true,
      createdAt: true,
      updatedAt: true,
      assignedTo: { select: { id: true, name: true } },
      course: { select: { slug: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          body: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    courseSlug: row.course?.slug ?? null,
    preferredBatch: row.preferredBatch,
    message: row.message,
    source: row.source,
    status: row.status,
    lostReason: row.lostReason,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    enrolledAt: row.enrolledAt?.toISOString() ?? null,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    referrerUrl: row.referrerUrl,
    consentAt: row.consentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assigneeId: row.assignedTo?.id ?? null,
    assigneeName: row.assignedTo?.name ?? null,
    activities: row.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      body: activity.body,
      createdAt: activity.createdAt.toISOString(),
      actorName: activity.actor?.name ?? null,
    })),
  };
}

/** Other leads that share this phone number (duplicate banner, docs/05 §4.1). */
export async function findDuplicateLeads(
  id: string,
  phone: string
): Promise<{ id: string; fullName: string; createdAt: string }[]> {
  const rows = await db.lead.findMany({
    where: { phone, NOT: { id } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, fullName: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Staff who can own a lead. */
export async function listLeadAssignees(): Promise<
  { id: string; name: string }[]
> {
  return db.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "ADMIN", "COUNSELOR"] } },
    orderBy: { name: "asc" },
    take: ADMIN_PICKER_LIMIT,
    select: { id: true, name: true },
  });
}

/** Course slugs for the filter dropdown. */
export async function listLeadCourseOptions(): Promise<
  { slug: string; title: string }[]
> {
  return db.course.findMany({
    orderBy: { title: "asc" },
    take: ADMIN_PICKER_LIMIT,
    select: { slug: true, title: true },
  });
}

/**
 * Every row matching the filters, for the CSV export. Reads one row past the
 * cap so the caller can tell a full page from the whole answer instead of
 * guessing, and never sorts or pages — the export is the filtered set, in
 * creation order.
 */
export async function listLeadsForExport(
  filters: LeadFilters,
  scope: LeadScope
): Promise<{ rows: LeadListRow[]; truncated: boolean }> {
  const found = await db.lead.findMany({
    where: leadWhere(filters, scope),
    orderBy: { createdAt: "desc" },
    take: LEAD_EXPORT_MAX_ROWS + 1,
    select: listSelect,
  });
  const truncated = found.length > LEAD_EXPORT_MAX_ROWS;
  return {
    rows: found.slice(0, LEAD_EXPORT_MAX_ROWS).map(toListRow),
    truncated,
  };
}

/** Dashboard and admin badges. One grouped query instead of N counts. */
export async function countLeadsByStatus(
  scope?: Prisma.LeadWhereInput
): Promise<LeadCountsByStatus> {
  const grouped = await db.lead.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });

  const counts = {
    NEW: 0,
    CONTACTED: 0,
    COUNSELING_DONE: 0,
    DEMO_SCHEDULED: 0,
    ENROLLED: 0,
    LOST: 0,
    SPAM: 0,
  } as LeadCountsByStatus;

  for (const row of grouped) {
    counts[row.status] = row._count._all;
  }
  return counts;
}

export type LeadStatusChange = {
  status: Lead["status"];
  lostReason: string | null;
  enrolledAt: Date | null;
};

/** Builds the status-change patch, recording ENROLLED/LOST specifics. */
export function leadStatusPatch(
  status: Lead["status"],
  lostReason: string | null
): Prisma.LeadUpdateInput {
  if (status === "LOST") {
    return { status, lostReason: lostReason ?? null };
  }
  if (status === "ENROLLED") {
    return { status, lostReason: null, enrolledAt: new Date() };
  }
  return { status, lostReason: null, enrolledAt: null };
}
