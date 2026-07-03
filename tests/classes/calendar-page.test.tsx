import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verify: vi.fn(),
  getParentClasses: vi.fn(),
  getNextParentClass: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/parent-access/session", () => ({
  PARENT_SESSION_COOKIE: "parent_session",
  verifyParentSession: mocks.verify,
}));
vi.mock("@/features/classes/queries", () => ({
  getParentClasses: mocks.getParentClasses,
  getNextParentClass: mocks.getNextParentClass,
}));

import CalendarPage from "@/app/calendar/page";

afterEach(cleanup);

describe("calendar page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T07:30:00Z"));
    mocks.cookieGet.mockReturnValue({ value: "signed-token" });
    mocks.verify.mockResolvedValue({ scope: "parent" });
    mocks.getParentClasses.mockResolvedValue({
      classes: [],
      school: { display_name: "North Star School", timezone: "America/Los_Angeles" },
    });
    mocks.getNextParentClass.mockResolvedValue(null);
  });

  afterEach(() => vi.useRealTimers());

  it("redirects before querying when the session cookie is missing", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(CalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/access",
    );
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.getParentClasses).not.toHaveBeenCalled();
    expect(mocks.getNextParentClass).not.toHaveBeenCalled();
  });

  it("redirects before querying when the session token is invalid", async () => {
    mocks.verify.mockResolvedValue(null);
    await expect(CalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/access",
    );
    expect(mocks.getParentClasses).not.toHaveBeenCalled();
    expect(mocks.getNextParentClass).not.toHaveBeenCalled();
  });

  it.each([
    { date: "2026-02-30" },
    { date: "06-22-2026" },
    { date: "9999-12-31" },
    { date: ["2026-06-22", "2026-06-23"] },
    { view: "week" },
  ])("redirects malformed search params to the canonical calendar", async (searchParams) => {
    await expect(CalendarPage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow(
      "REDIRECT:/calendar",
    );
    expect(mocks.getParentClasses).not.toHaveBeenCalled();
  });

  it("defaults to agenda and today's date in the school timezone", async () => {
    const page = await CalendarPage({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByRole("heading", { name: "North Star School" })).toBeInTheDocument();
    expect(screen.getByText("No classes scheduled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agenda view" })).toHaveAttribute(
      "href",
      "/calendar?date=2026-06-22&view=agenda",
    );
    expect(mocks.getParentClasses).toHaveBeenCalledWith(
      {
        from: "2026-05-31T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
        sessionToken: "signed-token",
      },
    );
  });

  it("renders the requested month view", async () => {
    const page = await CalendarPage({
      searchParams: Promise.resolve({ date: "2026-12-15", view: "month" }),
    });
    render(page);
    expect(screen.getByRole("table", { name: "December 2026" })).toBeInTheDocument();
    expect(screen.getByText("No classes scheduled")).toBeInTheDocument();
  });

  it("does not mark a future viewed class when the global next class is earlier", async () => {
    mocks.getParentClasses.mockResolvedValue({
      classes: [{
        id: "august-class",
        title: "August class",
        description: null,
        teacher_name: "Teacher",
        starts_at: "2026-08-10T17:00:00Z",
        ends_at: "2026-08-10T18:00:00Z",
        zoom_url: "https://zoom.us/j/123",
        status: "scheduled",
      }],
      school: { display_name: "North Star School", timezone: "UTC" },
    });
    mocks.getNextParentClass.mockResolvedValue({ id: "july-class" });

    const page = await CalendarPage({
      searchParams: Promise.resolve({ date: "2026-08-10", view: "agenda" }),
    });
    render(page);

    expect(screen.queryByText("Next class")).not.toBeInTheDocument();
    expect(mocks.getNextParentClass).toHaveBeenCalledWith({
      from: "2026-06-22T07:30:00.000Z",
      sessionToken: "signed-token",
    });
  });
});
