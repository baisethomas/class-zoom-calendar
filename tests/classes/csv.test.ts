// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseClassCsv, parseCsv } from "@/features/classes/csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    expect(parseCsv('a,"b, with comma","c ""quoted"""\r\nnext,"multi\nline",z')).toEqual([
      ["a", "b, with comma", 'c "quoted"'],
      ["next", "multi\nline", "z"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseClassCsv", () => {
  const HEADER = "title,teacher,date,start_time,end_time,zoom_url,description";

  it("maps rows by header name with 1-based row numbers including the header", () => {
    const result = parseClassCsv(
      `${HEADER}\nAlgebra I,Ada Lovelace,2026-09-01,16:00,17:00,https://school.zoom.us/j/1,Notes`,
    );

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          rowNumber: 2,
          title: "Algebra I",
          teacherName: "Ada Lovelace",
          date: "2026-09-01",
          startTime: "16:00",
          endTime: "17:00",
          zoomUrl: "https://school.zoom.us/j/1",
          description: "Notes",
        },
      ],
    });
  });

  it("accepts reordered columns and a missing optional description", () => {
    const result = parseClassCsv(
      "teacher,title,zoom_url,end_time,start_time,date\nAda,Math,https://zoom.us/j/1,17:00,16:00,2026-09-01",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0]).toMatchObject({
        title: "Math",
        teacherName: "Ada",
        description: "",
      });
    }
  });

  it("rejects a missing required column", () => {
    const result = parseClassCsv("title,teacher,date,start_time,end_time\nMath,Ada,2026-09-01,16:00,17:00");
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("zoom_url");
  });

  it("rejects an empty file and a header-only file", () => {
    expect(parseClassCsv("")).toMatchObject({ ok: false });
    expect(parseClassCsv(HEADER)).toMatchObject({ ok: false });
  });

  it("rejects files above the row limit", () => {
    const rows = Array.from({ length: 501 }, () => "Math,Ada,2026-09-01,16:00,17:00,https://zoom.us/j/1,").join("\n");
    const result = parseClassCsv(`${HEADER}\n${rows}`);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("too many rows");
  });
});
