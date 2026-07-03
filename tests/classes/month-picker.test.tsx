import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthPicker, buildMonthGrid } from "@/features/classes/month-picker";

afterEach(cleanup);

describe("buildMonthGrid", () => {
  it("builds a complete Monday-first grid without changing date at UTC offsets", () => {
    const grid = buildMonthGrid("2026-06-15");
    expect(grid).toHaveLength(35);
    expect(grid[0]).toEqual({ date: "2026-06-01", inMonth: true });
    expect(grid[34]).toEqual({ date: "2026-07-05", inMonth: false });
  });

  it("handles leap days and year boundaries", () => {
    expect(buildMonthGrid("2028-02-10").some((day) => day.date === "2028-02-29")).toBe(true);
    const january = buildMonthGrid("2027-01-15");
    expect(january[0]?.date).toBe("2026-12-28");
  });
});

describe("MonthPicker", () => {
  it("links previous and next months across a year boundary with stable query strings", () => {
    render(
      <MonthPicker
        selectedDate="2026-12-15"
        todayDate="2026-06-22"
        view="month"
        classDateKeys={new Set(["2026-12-15"])}
      />,
    );

    expect(screen.getByRole("link", { name: "Previous month" })).toHaveAttribute(
      "href",
      "/calendar?date=2026-11-01&view=month",
    );
    expect(screen.getByRole("link", { name: "Next month" })).toHaveAttribute(
      "href",
      "/calendar?date=2027-01-01&view=month",
    );
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/calendar?date=2026-06-22&view=month",
    );
    expect(screen.getByRole("link", { name: "Agenda view" })).toHaveAttribute(
      "href",
      "/calendar?date=2026-12-15&view=agenda",
    );
  });

  it("makes every date a large labeled link and indicates dates with classes in text", async () => {
    render(
      <MonthPicker
        selectedDate="2026-06-15"
        todayDate="2026-06-22"
        view="month"
        classDateKeys={new Set(["2026-06-15"])}
      />,
    );
    const calendar = screen.getByRole("table", { name: "June 2026" });
    expect(within(calendar).getAllByRole("columnheader").map((header) => header.textContent))
      .toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(within(calendar).getAllByRole("row")).toHaveLength(6);
    expect(within(calendar).getByRole("link", { name: "June 15, 2026, classes scheduled" }))
      .toHaveAttribute("href", "/calendar?date=2026-06-15&view=month");
    expect(within(calendar).getByRole("link", { name: "June 16, 2026" })).toHaveAttribute(
      "href",
      "/calendar?date=2026-06-16&view=month",
    );

    const user = userEvent.setup();
    const dateLink = within(calendar).getByRole("link", { name: "June 15, 2026, classes scheduled" });
    const activation = vi.fn((event: MouseEvent) => event.preventDefault());
    dateLink.addEventListener("click", activation);
    dateLink.focus();
    expect(dateLink).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(activation).toHaveBeenCalledTimes(1);
  });
});
