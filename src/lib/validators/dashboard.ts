import { z } from "zod";
import { PREFERRED_BATCHES } from "./shared";

/**
 * Client-safe bits of the admin dashboard (docs/05 §5).
 *
 * No Prisma, no `server-only`: the range control and the chart wrappers are
 * client components, and the series helpers are unit tested.
 */

/** Selectable "leads per day" ranges, in days. */
export const DASHBOARD_RANGES = [7, 30, 90] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_DEFAULT_RANGE: DashboardRange = 30;

/**
 * Range arrives from the URL, so it is coerced and falls back instead of
 * throwing on a hand-edited link.
 */
export const dashboardFilterSchema = z.object({
  range: z.coerce
    .number()
    .refine(
      (value): value is DashboardRange =>
        (DASHBOARD_RANGES as readonly number[]).includes(value),
      "Unsupported range"
    )
    .catch(DASHBOARD_DEFAULT_RANGE),
});

export type DashboardFilters = z.output<typeof dashboardFilterSchema>;

/** Human label for the range control. */
export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

/**
 * Cache windows per widget group, in seconds (docs/05 §5: 1–5 minutes). Lead
 * numbers move constantly, so they get the short window; content health changes
 * only when an editor saves, so it gets the long one.
 */
export const DASHBOARD_TTL = {
  /** KPIs, charts and lead lists. */
  leads: 60,
  /** Messages/subscribers counters that no counselor may see. */
  audience: 120,
  /** Drafts awaiting attention, upcoming events. */
  content: 300,
} as const;

/** Chart labels for `Lead.source`. */
export const LEAD_SOURCE_LABELS = {
  WEBSITE_INQUIRY: "Website inquiry",
  CONTACT_FORM: "Contact form",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  EVENT: "Event",
  REFERRAL: "Referral",
  OTHER: "Other",
} as const satisfies Record<string, string>;

/** Chart labels for `Lead.preferredBatch`. */
export const PREFERRED_BATCH_LABELS = {
  MORNING: "Morning",
  DAY: "Day",
  EVENING: "Evening",
  WEEKEND: "Weekend",
  ANY: "No preference",
} as const satisfies Record<(typeof PREFERRED_BATCHES)[number], string>;

/** Funnel order: the happy path first, then the two exits. */
export const FUNNEL_STATUS_ORDER = [
  "NEW",
  "CONTACTED",
  "COUNSELING_DONE",
  "DEMO_SCHEDULED",
  "ENROLLED",
  "LOST",
  "SPAM",
] as const;

export type FunnelStatus = (typeof FUNNEL_STATUS_ORDER)[number];

export type DailyPoint = { day: string; label: string; count: number };

/** One row of the raw per-day query (`to_char(..., 'YYYY-MM-DD')`). */
export type DailyRow = { day: string; count: number | bigint | string };

/**
 * Turns the sparse rows Postgres returns into the dense series a chart needs:
 * one point per Kathmandu day in the window, zeros included.
 *
 * Kept pure and separate from the query so the "chart totals match the table"
 * invariant is testable without a database.
 */
export function buildDailySeries(
  rows: readonly DailyRow[],
  fromDayKey: string,
  toDayKey: string,
  label: (dayKey: string) => string = (key) => key
): DailyPoint[] {
  const countByDay = new Map<string, number>();
  for (const row of rows) {
    const previous = countByDay.get(row.day) ?? 0;
    countByDay.set(row.day, previous + toCount(row.count));
  }

  const series: DailyPoint[] = [];
  const cursor = new Date(`${fromDayKey}T00:00:00Z`);
  const last = new Date(`${toDayKey}T00:00:00Z`);
  // Guard against a malformed key: never loop forever.
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return series;

  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    series.push({ day, label: label(day), count: countByDay.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

/** `count(*)` arrives as a bigint from the pg driver. */
export function toCount(value: number | bigint | string): number {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Sum of a series — used by the tests to compare against a direct count. */
export function totalOf(points: readonly DailyPoint[]): number {
  return points.reduce((sum, point) => sum + point.count, 0);
}

/** `+12.5%` / `-4%` / `null` when there is no previous period to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
