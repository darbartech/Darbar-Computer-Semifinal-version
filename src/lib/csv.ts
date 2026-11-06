/**
 * CSV for admin downloads.
 *
 * Two hazards, both real for a file built out of what visitors typed:
 *
 * - A cell that starts with `=`, `+`, `-`, `@`, tab or CR is not text in Excel —
 *   it is a formula, and `=HYPERLINK(...)` or `=cmd|...` turns an exported lead
 *   name into something the accountant's spreadsheet executes. Leading guard
 *   characters are therefore escaped with a `'` prefix before anything else.
 * - `"` and `,` and newlines would otherwise let one field occupy two columns
 *   or a row spill into the next, so quoting follows RFC 4180.
 *
 * The BOM is what makes Excel read Nepali text (devanagari course titles) as
 * UTF-8 rather than its regional default.
 */

const FORMULA_GUARD = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_GUARD.test(text) ? `'${text}` : text;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(",");
}

/** One header row plus the data, CRLF-terminated, BOM-prefixed. */
export function csvDocument(
  header: readonly string[],
  rows: readonly (readonly CsvValue[])[]
): string {
  return [`\uFEFF${csvRow(header)}`, ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/** `leads-2026-11-06.csv` — nothing from user input reaches the filename. */
export function csvFilename(prefix: string, dayKey: string): string {
  return `${prefix.replace(/[^a-z0-9-]+/gi, "-")}-${dayKey}.csv`;
}
