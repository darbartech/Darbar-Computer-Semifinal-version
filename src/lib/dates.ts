/**
 * Date helpers pinned to Asia/Kathmandu (docs 02 B10).
 *
 * Dates are stored in UTC (or as `@db.Date`, which Prisma hands back as UTC
 * midnight) and must be *displayed* in campus time. `toLocaleDateString()` with
 * no `timeZone` reads the runtime's own zone, so a Vercel/UTC server and a local
 * dev machine disagree by hours — and a `@db.Date` parsed with `new Date(string)`
 * shifts by a day. Every date in the UI goes through these helpers instead.
 *
 * `src/lib/format.ts` carries the fixed-offset arithmetic for the admin tables;
 * this module is the short-form API the rest of the app imports, and reuses it
 * for day boundaries so there is only one definition of "today in Kathmandu".
 */

import { endOfKathmanduDay, kathmanduDayKey, startOfKathmanduDay } from "./format";

const TZ = "Asia/Kathmandu";
const LOCALE = "en-NP";

/** `05 Nov 2026` — pass `opts` for a different shape. */
export function fmtDate(
  value: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }).format(
    typeof value === "string" ? new Date(value) : value
  );
}

/** `05 Nov 2026, 14:30` in campus time. */
export function fmtDateTime(value: Date | string): string {
  return fmtDate(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** `2:30 PM` in campus time. */
export function fmtTime(value: Date | string): string {
  return fmtDate(value, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Midnight starting the Kathmandu day that contains `value`. */
export function startOfDayNpt(value: Date | string = new Date()): Date {
  return startOfKathmanduDay(typeof value === "string" ? new Date(value) : value);
}

/**
 * The UTC interval spanned by one Kathmandu calendar day: `gte` is campus
 * midnight, `lt` the next campus midnight (exclusive). Use it for timestamp
 * columns such as a receipt's `receivedAt`, which is stamped at campus midnight
 * for the day the clerk wrote on the counter. A `YYYY-MM-DD` day key is *not* a
 * UTC day: filtering on `[keyT00:00Z, +1 day)` drops the first 5h45m of the
 * campus day and pulls in the previous evening instead.
 */
export function kathmanduDayRange(
  dayKey: string
): { gte: Date; lt: Date } | null {
  const marker = parseDateOnly(dayKey);
  if (!marker) return null;
  return { gte: startOfKathmanduDay(marker), lt: endOfKathmanduDay(marker) };
}

/** Calendar year in campus time — the numbering year for codes and receipts. */
export function nepalYear(value: Date | string = new Date()): number {
  return Number(kathmanduDayKey(value).slice(0, 4));
}

/** `YYYY-MM-DD` as seen in Kathmandu — for `<input type="date">` and API params. */
export function toDateInputValue(value: Date | string): string {
  return kathmanduDayKey(value);
}

/**
 * A `YYYY-MM-DD` string as the UTC midnight Date Prisma expects for a `@db.Date`
 * column. Never `new Date("2026-04-08 00:00")`: parsing in the local zone can
 * land on the previous or next calendar day.
 */
export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The `YYYY-MM-DD` behind a `@db.Date` column (UTC midnight, so no shift). */
export function dateOnlyValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
