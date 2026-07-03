import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classLiveState, JoinAction, LiveBadge } from "@/features/classes/live-status";

const STARTS_AT = "2026-07-01T23:00:00.000Z";
const ENDS_AT = "2026-07-02T00:00:00.000Z";

function at(offsetMinutesFromStart: number): number {
  return Date.parse(STARTS_AT) + offsetMinutesFromStart * 60 * 1000;
}

describe("classLiveState", () => {
  it.each([
    [-120, "upcoming"],
    [-61, "upcoming"],
    [-60, "soon"],
    [-11, "soon"],
    [-10, "live"],
    [0, "live"],
    [59, "live"],
    [60, "ended"],
    [120, "ended"],
  ])("%s minutes from start is %s", (offset, expected) => {
    expect(classLiveState(STARTS_AT, ENDS_AT, at(offset))).toBe(expected);
  });

  it("treats invalid instants as upcoming", () => {
    expect(classLiveState("bad", ENDS_AT, at(0))).toBe("upcoming");
  });
});

describe("live components", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderAt(offsetMinutes: number, ui: React.ReactElement) {
    vi.setSystemTime(at(offsetMinutes));
    render(ui);
  }

  it("shows a happening-now badge during class", async () => {
    renderAt(5, <LiveBadge startsAt={STARTS_AT} endsAt={ENDS_AT} />);
    expect(await screen.findByText("Happening now")).toBeInTheDocument();
  });

  it("shows minutes until start within the hour before class", async () => {
    renderAt(-30, <LiveBadge startsAt={STARTS_AT} endsAt={ENDS_AT} />);
    expect(await screen.findByText("Starts in 30 min")).toBeInTheDocument();
  });

  it("renders nothing well before or after class", async () => {
    renderAt(-120, <LiveBadge startsAt={STARTS_AT} endsAt={ENDS_AT} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Happening|Starts in/)).not.toBeInTheDocument();
  });

  it("upgrades the join link during class", async () => {
    renderAt(5, (
      <JoinAction
        href="https://school.zoom.us/j/123"
        title="Algebra I"
        startsAt={STARTS_AT}
        endsAt={ENDS_AT}
      />
    ));

    const link = await screen.findByRole("link", { name: /Join Algebra I on Zoom/ });
    expect(link).toHaveTextContent("Join now");
    expect(link.className).toContain("join-action--live");
  });

  it("renders a normal join link outside the live window", async () => {
    renderAt(-120, (
      <JoinAction
        href="https://school.zoom.us/j/123"
        title="Algebra I"
        startsAt={STARTS_AT}
        endsAt={ENDS_AT}
      />
    ));

    const link = await screen.findByRole("link", { name: /Join Algebra I on Zoom/ });
    expect(link).toHaveTextContent("Join on Zoom");
    expect(link.className).not.toContain("join-action--live");
  });
});
