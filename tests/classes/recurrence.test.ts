// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  dateKeyDayDelta,
  isValidDateKey,
  MAX_SERIES_SPAN_DAYS,
  weeklyDateKeys,
} from "@/features/classes/recurrence";

describe("date key validation", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateKey("2026-07-02")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
  });

  it.each([
    ["2026-02-30", "impossible day"],
    ["2026-13-01", "impossible month"],
    ["1999-01-01", "before supported range"],
    ["2101-01-01", "after supported range"],
    ["2026-7-2", "not zero padded"],
    ["not-a-date", "not a date"],
  ])("rejects %s (%s)", (value) => {
    expect(isValidDateKey(value)).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("computes signed day deltas", () => {
    expect(dateKeyDayDelta("2026-07-01", "2026-07-08")).toBe(7);
    expect(dateKeyDayDelta("2026-07-08", "2026-07-01")).toBe(-7);
    expect(dateKeyDayDelta("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("rejects invalid inputs", () => {
    expect(() => addDaysToDateKey("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDaysToDateKey("2026-07-01", 1.5)).toThrow(RangeError);
    expect(() => dateKeyDayDelta("bad", "2026-07-01")).toThrow(RangeError);
  });
});

describe("weekly series dates", () => {
  it("includes the start date and every seventh day through the until date", () => {
    expect(weeklyDateKeys("2026-07-01", "2026-07-22")).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
      "2026-07-22",
    ]);
  });

  it("excludes a final partial week", () => {
    expect(weeklyDateKeys("2026-07-01", "2026-07-21")).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
    ]);
  });

  it("returns a single date when until equals the start", () => {
    expect(weeklyDateKeys("2026-07-01", "2026-07-01")).toEqual(["2026-07-01"]);
  });

  it("rejects an until date before the start", () => {
    expect(() => weeklyDateKeys("2026-07-01", "2026-06-30")).toThrow(RangeError);
  });

  it("caps the series span", () => {
    const until = addDaysToDateKey("2026-07-01", MAX_SERIES_SPAN_DAYS + 1);
    expect(() => weeklyDateKeys("2026-07-01", until)).toThrow(RangeError);
    const atLimit = addDaysToDateKey("2026-07-01", MAX_SERIES_SPAN_DAYS);
    expect(weeklyDateKeys("2026-07-01", atLimit).length).toBe(53);
  });
});
