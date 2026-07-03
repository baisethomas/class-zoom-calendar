// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildCalendarIcs, type IcsClass } from "@/features/calendar-feed/ics";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function sampleClass(overrides: Partial<IcsClass> = {}): IcsClass {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    title: "Algebra I",
    description: "Linear equations",
    teacher_name: "Ada Lovelace",
    starts_at: "2026-07-01T23:00:00.000Z",
    ends_at: "2026-07-02T00:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/123456789",
    status: "scheduled",
    ...overrides,
  };
}

function unfold(ics: string): string {
  return ics.replaceAll("\r\n ", "");
}

describe("buildCalendarIcs", () => {
  it("produces a valid VCALENDAR wrapper with calendar name", () => {
    const ics = buildCalendarIcs({
      classes: [sampleClass()],
      calendarName: "Sunrise School",
      host: "calendar.example.org",
      generatedAt: GENERATED_AT,
    });

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Sunrise School");
  });

  it("renders events with UTC instants, UID, summary, and zoom join details", () => {
    const ics = unfold(
      buildCalendarIcs({
        classes: [sampleClass()],
        calendarName: "Sunrise School",
        host: "calendar.example.org",
        generatedAt: GENERATED_AT,
      }),
    );

    expect(ics).toContain("UID:123e4567-e89b-12d3-a456-426614174000@calendar.example.org");
    expect(ics).toContain("DTSTART:20260701T230000Z");
    expect(ics).toContain("DTEND:20260702T000000Z");
    expect(ics).toContain("DTSTAMP:20260702T120000Z");
    expect(ics).toContain("SUMMARY:Algebra I");
    expect(ics).toContain(
      "DESCRIPTION:Teacher: Ada Lovelace\\nLinear equations\\nJoin on Zoom: https://school.zoom.us/j/123456789",
    );
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("marks canceled classes as CANCELLED", () => {
    const ics = buildCalendarIcs({
      classes: [sampleClass({ status: "canceled" })],
      calendarName: "Sunrise School",
      host: "calendar.example.org",
      generatedAt: GENERATED_AT,
    });

    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("escapes special characters in text fields", () => {
    const ics = unfold(
      buildCalendarIcs({
        classes: [
          sampleClass({
            title: "Math; Art, and\nMore\\Stuff",
            description: null,
          }),
        ],
        calendarName: "A; B, C",
        host: "calendar.example.org",
        generatedAt: GENERATED_AT,
      }),
    );

    expect(ics).toContain("SUMMARY:Math\\; Art\\, and\\nMore\\\\Stuff");
    expect(ics).toContain("X-WR-CALNAME:A\\; B\\, C");
  });

  it("folds long lines to at most 75 octets", () => {
    const ics = buildCalendarIcs({
      classes: [sampleClass({ description: "x".repeat(400) })],
      calendarName: "Sunrise School",
      host: "calendar.example.org",
      generatedAt: GENERATED_AT,
    });

    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("rejects invalid instants", () => {
    expect(() =>
      buildCalendarIcs({
        classes: [sampleClass({ starts_at: "not-a-date" })],
        calendarName: "Sunrise School",
        host: "calendar.example.org",
        generatedAt: GENERATED_AT,
      }),
    ).toThrow(RangeError);
  });
});
