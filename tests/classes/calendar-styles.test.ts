// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("calendar styles", () => {
  it("scopes calendar component selectors so they cannot affect admin pages", () => {
    const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
    const genericCalendarSelector =
      /\n\.(?:calendar-header|calendar-layout|month-picker|view-switcher|month-navigation|month-grid|weekday|month-cell|date-link|agenda|class-list|class-card|teacher|status-pill|join-action|empty-state|month-summary|calendar-skeleton|error-panel|logout-button)(?:[\s,:.[#]|$)/;

    expect(css).not.toMatch(genericCalendarSelector);
    expect(css).toContain(".calendar-page .class-card");
    expect(css).toContain(".calendar-page .empty-state");
  });
});
