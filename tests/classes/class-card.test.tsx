import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ClassCard } from "@/features/classes/class-card";

afterEach(cleanup);

const baseClass = {
  id: "1",
  title: "Algebra Lab",
  description: "Bring graph paper.",
  teacher_name: "Ms. Rivera",
  starts_at: "2026-06-22T16:00:00Z",
  ends_at: "2026-06-22T17:00:00Z",
  zoom_url: "https://school.zoom.us/j/123?pwd=safe",
  status: "scheduled",
};

describe("ClassCard", () => {
  it("shows class details and a hardened Zoom link for a scheduled class", () => {
    render(<ClassCard classItem={baseClass} timeZone="America/Los_Angeles" isNext />);

    expect(screen.getByRole("heading", { name: "Algebra Lab" })).toBeInTheDocument();
    expect(screen.getByText("9:00 AM – 10:00 AM")).toBeInTheDocument();
    expect(screen.getByText(/Ms\. Rivera/)).toBeInTheDocument();
    expect(screen.getByText("Bring graph paper.")).toBeInTheDocument();
    expect(screen.getByText("Next class")).toBeInTheDocument();
    const join = screen.getByRole("link", { name: /join algebra lab on zoom/i });
    expect(join).toHaveAttribute("target", "_blank");
    expect(join).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a textual canceled state and no join action", () => {
    render(<ClassCard classItem={{ ...baseClass, status: "canceled" }} timeZone="UTC" />);
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join/i })).not.toBeInTheDocument();
  });

  it.each([
    "javascript:alert(1)",
    "https://zoom.us.evil.example/j/1",
    "https://user:password@zoom.us/j/1",
    "https://zoom.us/j/1#fragment",
  ])("renders no join action for an invalid URL: %s", (zoom_url) => {
    render(<ClassCard classItem={{ ...baseClass, zoom_url }} timeZone="UTC" />);
    expect(screen.getByText("Link unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join/i })).not.toBeInTheDocument();
  });
});
