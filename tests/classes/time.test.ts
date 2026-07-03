import { describe, expect, it } from "vitest";

import {
  formatClassTime,
  getDateKey,
  groupClassesByDate,
  instantToLocalDateTimeFields,
  localDateTimeToUtcInstant,
} from "@/features/classes/time";

describe("getDateKey", () => {
  it("uses the school-local date instead of the UTC date", () => {
    expect(getDateKey("2026-01-02T07:30:00Z", "America/Los_Angeles")).toBe("2026-01-01");
    expect(getDateKey("2026-01-02T08:30:00Z", "America/Los_Angeles")).toBe("2026-01-02");
  });

  it.each([
    ["invalid date", "not-a-date", "America/Los_Angeles"],
    ["date-only value", "2026-01-01", "America/Los_Angeles"],
    ["offsetless value", "2026-01-01T10:00:00", "America/Los_Angeles"],
    ["implementation-specific value", "January 1, 2026 10:00 AM", "America/Los_Angeles"],
    ["invalid time zone", "2026-01-01T00:00:00Z", "Mars/Olympus_Mons"],
  ])("throws a clear RangeError for an %s", (_label, date, timeZone) => {
    expect(() => getDateKey(date, timeZone)).toThrow(RangeError);
  });

  it("continues to accept valid Date objects", () => {
    expect(getDateKey(new Date("2026-01-02T07:30:00Z"), "America/Los_Angeles")).toBe(
      "2026-01-01",
    );
  });
});

describe("formatClassTime", () => {
  it("formats a concise school-local time range", () => {
    expect(
      formatClassTime(
        "2026-02-10T17:00:00Z",
        "2026-02-10T18:30:00Z",
        "America/Los_Angeles",
      ),
    ).toBe("9:00 AM – 10:30 AM");
  });

  it("reflects the spring-forward boundary with changing zone abbreviations", () => {
    expect(
      formatClassTime(
        "2026-03-08T09:30:00Z",
        "2026-03-08T10:30:00Z",
        "America/Los_Angeles",
      ),
    ).toBe("1:30 AM PST – 3:30 AM PDT");
  });

  it("disambiguates repeated fall-back wall-clock times", () => {
    expect(
      formatClassTime(
        "2026-11-01T08:30:00Z",
        "2026-11-01T09:30:00Z",
        "America/Los_Angeles",
      ),
    ).toBe("1:30 AM PDT – 1:30 AM PST");
  });

  it.each([
    ["invalid start", "bad", "2026-01-01T01:00:00Z", "UTC"],
    ["invalid end", "2026-01-01T00:00:00Z", "bad", "UTC"],
    ["invalid zone", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", "Bad/Zone"],
  ])("throws a RangeError for %s", (_label, startsAt, endsAt, timeZone) => {
    expect(() => formatClassTime(startsAt, endsAt, timeZone)).toThrow(RangeError);
  });
});

describe("local date-time conversion", () => {
  it("converts school-local class form fields into UTC instants", () => {
    expect(localDateTimeToUtcInstant("2026-07-01", "16:00", "America/Los_Angeles")).toBe(
      "2026-07-01T23:00:00.000Z",
    );
    expect(localDateTimeToUtcInstant("2026-01-15", "16:00", "America/Los_Angeles")).toBe(
      "2026-01-16T00:00:00.000Z",
    );
  });

  it("round-trips stored instants back to editable school-local form fields", () => {
    expect(instantToLocalDateTimeFields("2026-07-01T23:00:00.000Z", "America/Los_Angeles")).toEqual({
      date: "2026-07-01",
      time: "16:00",
    });
  });

  it("rejects nonexistent spring-forward local times", () => {
    expect(() =>
      localDateTimeToUtcInstant("2026-03-08", "02:30", "America/Los_Angeles"),
    ).toThrow(RangeError);
  });

  it("rejects malformed local fields and invalid time zones", () => {
    expect(() => localDateTimeToUtcInstant("2026-02-30", "16:00", "UTC")).toThrow(RangeError);
    expect(() => localDateTimeToUtcInstant("2026-07-01", "24:00", "UTC")).toThrow(RangeError);
    expect(() => localDateTimeToUtcInstant("2026-07-01", "16:00", "Bad/Zone")).toThrow(RangeError);
    expect(() => instantToLocalDateTimeFields("bad", "UTC")).toThrow(RangeError);
  });
});

describe("groupClassesByDate", () => {
  it("sorts groups and classes chronologically without mutating its input", () => {
    const classes = [
      { id: "late", starts_at: "2026-01-03T18:00:00Z" },
      { id: "early", starts_at: "2026-01-02T18:00:00Z" },
      { id: "middle", starts_at: "2026-01-03T17:00:00Z" },
    ];
    const originalOrder = classes.map(({ id }) => id);

    const groups = groupClassesByDate(classes, "America/Los_Angeles");

    expect(groups.map(({ dateKey }) => dateKey)).toEqual(["2026-01-02", "2026-01-03"]);
    expect(groups.map(({ classes: items }) => items.map(({ id }) => id))).toEqual([
      ["early"],
      ["middle", "late"],
    ]);
    expect(classes.map(({ id }) => id)).toEqual(originalOrder);
    expect(groups[1]?.classes).not.toBe(classes);
  });

  it("groups timestamps that cross UTC midnight by their local dates", () => {
    const sameLocalDate = [
      { id: "before-utc-midnight", starts_at: "2026-01-01T23:30:00Z" },
      { id: "after-utc-midnight", starts_at: "2026-01-02T07:30:00Z" },
    ];
    expect(groupClassesByDate(sameLocalDate, "America/Los_Angeles")).toHaveLength(1);

    const sameUtcDate = [
      { id: "local-jan-1", starts_at: "2026-01-02T07:30:00Z" },
      { id: "local-jan-2", starts_at: "2026-01-02T08:30:00Z" },
    ];
    expect(
      groupClassesByDate(sameUtcDate, "America/Los_Angeles").map(({ dateKey }) => dateKey),
    ).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("rejects invalid class dates and time zones predictably", () => {
    expect(() => groupClassesByDate([{ starts_at: "bad" }], "UTC")).toThrow(RangeError);
    expect(() =>
      groupClassesByDate([{ starts_at: "2026-01-01T00:00:00Z" }], "Bad/Zone"),
    ).toThrow(RangeError);
  });

  it("keeps the original relative order for equal timestamps", () => {
    const classes = [
      { id: "first", starts_at: "2026-01-01T18:00:00Z" },
      { id: "second", starts_at: "2026-01-01T18:00:00+00:00" },
      { id: "third", starts_at: "2026-01-01T18:00:00.000Z" },
    ];

    expect(
      groupClassesByDate(classes, "America/Los_Angeles")[0]?.classes.map(({ id }) => id),
    ).toEqual(["first", "second", "third"]);
  });
});
