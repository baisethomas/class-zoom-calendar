import { describe, expect, it } from "vitest";

import { classInputSchema } from "@/features/classes/schema";

const validInput = {
  title: "  Algebra I  ",
  description: "  Linear equations  ",
  teacherName: "  Ada Lovelace  ",
  startsAt: "2026-07-01T16:00:00-07:00",
  endsAt: "2026-07-01T17:00:00-07:00",
  zoomUrl: "  https://school.zoom.us/j/123456789?pwd=abc  ",
  status: "scheduled" as const,
};

describe("classInputSchema", () => {
  it("accepts and normalizes a valid class matching the database contract", () => {
    expect(classInputSchema.parse(validInput)).toEqual({
      title: "Algebra I",
      description: "Linear equations",
      teacherName: "Ada Lovelace",
      startsAt: "2026-07-01T23:00:00.000Z",
      endsAt: "2026-07-02T00:00:00.000Z",
      zoomUrl: "https://school.zoom.us/j/123456789?pwd=abc",
      status: "scheduled",
    });
  });

  it.each([
    ["blank title", { title: "   " }],
    ["long title", { title: "x".repeat(121) }],
    ["blank teacher", { teacherName: "\n " }],
    ["long teacher", { teacherName: ` ${"x".repeat(121)} ` }],
    ["long description", { description: "x".repeat(1001) }],
    ["invalid start", { startsAt: "tomorrow" }],
    ["date without an offset", { startsAt: "2026-07-01T16:00:00" }],
    ["invalid end", { endsAt: "2026-02-30T10:00:00Z" }],
    ["unknown status", { status: "finished" }],
  ])("rejects %s", (_label, override) => {
    expect(classInputSchema.safeParse({ ...validInput, ...override }).success).toBe(false);
  });

  it.each([
    "https://zoom.us.evil.example/j/1",
    "https://evilzoom.us/j/1",
    "https://zoom.us@evil.example/j/1",
    "https://user:password@zoom.us/j/1",
    "https://zoom.us:8443/j/1",
    "https://zoom.us/j/1#secret",
    "http://zoom.us/j/1",
    "not a url",
  ])("rejects unsafe or deceptive Zoom URL %s", (zoomUrl) => {
    expect(classInputSchema.safeParse({ ...validInput, zoomUrl }).success).toBe(false);
  });

  it.each(["https://zoom.us/j/1", "https://us02web.zoom.us/j/1"])(
    "accepts the exact Zoom host or a subdomain: %s",
    (zoomUrl) => {
      expect(classInputSchema.parse({ ...validInput, zoomUrl }).zoomUrl).toBe(zoomUrl);
    },
  );

  it("measures trimmed text limits in Unicode code points like the database", () => {
    const emoji = "📚";

    expect(
      classInputSchema.safeParse({
        ...validInput,
        title: ` ${emoji.repeat(120)} `,
        teacherName: emoji.repeat(120),
        description: emoji.repeat(1000),
      }).success,
    ).toBe(true);
    expect(
      classInputSchema.safeParse({ ...validInput, title: emoji.repeat(121) }).success,
    ).toBe(false);
    expect(
      classInputSchema.safeParse({ ...validInput, teacherName: emoji.repeat(121) }).success,
    ).toBe(false);
    expect(
      classInputSchema.safeParse({ ...validInput, description: emoji.repeat(1001) }).success,
    ).toBe(false);
  });

  it("requires the end instant to be strictly later than the start", () => {
    const instant = "2026-07-01T16:00:00Z";
    expect(
      classInputSchema.safeParse({ ...validInput, startsAt: instant, endsAt: instant }).success,
    ).toBe(false);
    expect(
      classInputSchema.safeParse({
        ...validInput,
        startsAt: instant,
        endsAt: "2026-07-01T15:59:59Z",
      }).success,
    ).toBe(false);
  });
});
