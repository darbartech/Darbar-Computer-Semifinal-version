import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, csvFilename, csvRow } from "../src/lib/csv";
import {
  LEAD_EXPORT_MAX_RANGE_DAYS,
  resolveLeadExportRange,
} from "../src/lib/validators/lead";

/**
 * Fix guide §11 — CSV exports.
 *
 * A lead export is stranger-written text opened in a spreadsheet by staff, so
 * the escaping rules are the security boundary, and the date window is what
 * stops "download these leads" from meaning "download every lead".
 */

describe("csvCell — formula injection", () => {
  it.each(["=1+1", "+1-2", "-2+3", "@SUM(A1)", "\tsneaky"])(
    "neutralises a cell that starts with a guard character: %j",
    (value) => {
      expect(csvCell(value)).toBe(`'${value}`);
    }
  );

  it("guards and quotes a leading carriage return", () => {
    expect(csvCell("\rsneaky")).toBe('"\'\rsneaky"');
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Sita Gurung")).toBe("Sita Gurung");
    expect(csvCell("9841000000")).toBe("9841000000");
    expect(csvCell("course-2026")).toBe("course-2026");
  });

  it("only guards the leading character", () => {
    expect(csvCell("1+1")).toBe("1+1");
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("quotes what would otherwise break the shape of the row", () => {
    expect(csvCell('Birendra "Birendra" Nagar')).toBe('"Birendra ""Birendra"" Nagar"');
    expect(csvCell("Kathmandu, Bagmati")).toBe('"Kathmandu, Bagmati"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("escapes before it quotes — a guard character cannot hide inside a quoted cell", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"click\")")).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    );
  });

  it("writes nothing for an absent value", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvRow(["a", null, undefined, "b"])).toBe("a,,,b");
  });
});

describe("csvDocument", () => {
  it("is BOM-prefixed, CRLF-terminated and header-first", () => {
    const csv = csvDocument(["Name", "Phone"], [["Sita", "9841000000"]]);

    expect(csv).toBe('\uFEFFName,Phone\r\nSita,9841000000\r\n');
  });
});

describe("csvFilename", () => {
  it("keeps a path- and header-safe name", () => {
    expect(csvFilename("leads", "2026-11-06")).toBe("leads-2026-11-06.csv");
    expect(csvFilename('lead"; ../../etc', "2026-11-06")).toBe(
      "lead-etc-2026-11-06.csv"
    );
  });
});

describe("resolveLeadExportRange", () => {
  const now = new Date("2026-11-06T08:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;

  it("defaults an unbounded request to the widest window it allows", () => {
    const range = resolveLeadExportRange({}, now);

    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.to).toEqual(now);
    expect(range.from).toEqual(new Date(now.getTime() - LEAD_EXPORT_MAX_RANGE_DAYS * DAY));
    expect(range.windowDefaulted).toBe(true);
  });

  it("refuses a window wider than the cap instead of quietly clipping it", () => {
    const range = resolveLeadExportRange(
      {
        from: "2026-01-01",
        to: "2026-11-06",
      },
      now
    );

    expect(range.ok).toBe(false);
    if (range.ok) return;
    expect(range.error).toContain(String(LEAD_EXPORT_MAX_RANGE_DAYS));
  });

  it("accepts an explicit window inside the cap", () => {
    const range = resolveLeadExportRange(
      { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" },
      now
    );

    expect(range).toEqual({
      ok: true,
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-31T00:00:00.000Z"),
      windowDefaulted: false,
    });
  });

  it("refuses a window that runs backwards", () => {
    const range = resolveLeadExportRange(
      { from: "2026-11-05", to: "2026-10-05" },
      now
    );

    expect(range.ok).toBe(false);
    if (range.ok) return;
    expect(range.error).toMatch(/on or before/i);
  });

  it("treats an unparseable date as unset rather than as all time", () => {
    const range = resolveLeadExportRange({ from: "not-a-date", to: "''" }, now);

    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.windowDefaulted).toBe(true);
    expect(range.from).toEqual(new Date(now.getTime() - LEAD_EXPORT_MAX_RANGE_DAYS * DAY));
  });

  it("allows exactly the capped span", () => {
    const from = new Date(now.getTime() - LEAD_EXPORT_MAX_RANGE_DAYS * DAY);
    const range = resolveLeadExportRange(
      { from: from.toISOString(), to: now.toISOString() },
      now
    );

    expect(range.ok).toBe(true);
  });
});
