/**
 * Shared formatting helpers for the admin UI (docs/02 §5: `lib/format.ts`).
 *
 * Dates are stored in UTC and always displayed in Asia/Kathmandu (UTC+5:45),
 * so staff see local time without doing arithmetic.
 */

const KATHMANDU_TZ = "Asia/Kathmandu";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: KATHMANDU_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: KATHMANDU_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/** `2026-04-08T14:30` in Kathmandu time, for `<input type="datetime-local">`. */
export function toLocalDateTimeInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KATHMANDU_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Kathmandu is UTC+5:45 with no daylight saving, so a fixed offset is exact
 * and avoids depending on the runtime's tz database.
 */
export function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00+05:45`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Click-to-call / WhatsApp digits: keeps a leading +, strips everything else. */
export function toDialablePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function waLink(phone: string): string {
  return `https://wa.me/${toDialablePhone(phone).replace(/\D/g, "")}`;
}

/* ───────────────────────── day boundaries in Kathmandu time ───────────────────────── */

/**
 * Nepal is UTC+05:45 with no daylight saving, so the offset is exact. The admin
 * dashboard counts "today" and "follow-ups due today" in campus time, and the
 * server's own timezone is not something to rely on (a Vercel build runs in UTC).
 */
const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;

function kathmanduParts(value: Date) {
  const shifted = new Date(value.getTime() + KATHMANDU_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** `YYYY-MM-DD` for a moment, as seen from Kathmandu. */
export function kathmanduDayKey(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const { year, month, day } = kathmanduParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local midnight at the start of the Kathmandu day containing `value`. */
export function startOfKathmanduDay(value: Date = new Date()): Date {
  const { year, month, day } = kathmanduParts(value);
  return new Date(
    Date.UTC(year, month, day, 0, 0, 0, 0) - KATHMANDU_OFFSET_MINUTES * 60_000
  );
}

/** The instant just before the next Kathmandu midnight (inclusive upper bound). */
export function endOfKathmanduDay(value: Date = new Date()): Date {
  const { year, month, day } = kathmanduParts(value);
  return new Date(
    Date.UTC(year, month, day + 1, 0, 0, 0, 0) - KATHMANDU_OFFSET_MINUTES * 60_000
  );
}

/** Short axis label for a `YYYY-MM-DD` key, e.g. `8 Apr`. */
export function dayKeyLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KATHMANDU_TZ,
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
