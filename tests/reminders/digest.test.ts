// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildDigestEmail } from "@/features/reminders/digest";

const CLASSES = [
  {
    title: "Algebra I",
    teacher_name: "Ada Lovelace",
    starts_at: "2026-07-01T23:00:00.000Z",
    ends_at: "2026-07-02T00:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/123",
    status: "scheduled",
  },
  {
    title: "Art",
    teacher_name: "Frida Kahlo",
    starts_at: "2026-07-02T17:00:00.000Z",
    ends_at: "2026-07-02T18:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/456",
    status: "scheduled",
  },
];

describe("buildDigestEmail", () => {
  it("summarizes scheduled classes grouped by school-local date", () => {
    const { subject, text } = buildDigestEmail({
      classes: CLASSES,
      schoolName: "Sunrise School",
      timeZone: "America/Los_Angeles",
      calendarUrl: "https://calendar.example.org/calendar",
      unsubscribeUrl: "https://calendar.example.org/api/reminder-unsubscribe?token=abc",
    });

    expect(subject).toBe("Reminder: 2 upcoming classes at Sunrise School");
    expect(text).toContain("Algebra I with Ada Lovelace");
    expect(text).toContain("Art with Frida Kahlo");
    expect(text).toContain("Join: https://school.zoom.us/j/123");
    expect(text).toContain("Full calendar: https://calendar.example.org/calendar");
    expect(text).toContain("Unsubscribe from reminders: https://calendar.example.org/api/reminder-unsubscribe?token=abc");
  });

  it("uses singular wording and excludes canceled classes", () => {
    const { subject, text } = buildDigestEmail({
      classes: [CLASSES[0]!, { ...CLASSES[1]!, status: "canceled" }],
      schoolName: "Sunrise School",
      timeZone: "America/Los_Angeles",
      calendarUrl: "https://calendar.example.org/calendar",
      unsubscribeUrl: "https://calendar.example.org/api/reminder-unsubscribe?token=abc",
    });

    expect(subject).toBe("Reminder: 1 upcoming class at Sunrise School");
    expect(text).not.toContain("Art");
  });
});
