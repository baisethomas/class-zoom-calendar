import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Agenda } from "@/features/classes/agenda";

afterEach(cleanup);

function classItem(id: string, starts_at: string, status = "scheduled") {
  return {
    id,
    title: `Class ${id}`,
    description: null,
    teacher_name: "Teacher",
    starts_at,
    ends_at: new Date(Date.parse(starts_at) + 60 * 60 * 1000).toISOString(),
    zoom_url: "https://zoom.us/j/123",
    status,
  };
}

describe("Agenda", () => {
  it("groups by school-local date and sorts dates and classes", () => {
    render(
      <Agenda
        classes={[
          classItem("late", "2026-06-23T18:00:00Z"),
          classItem("early", "2026-06-22T17:00:00Z"),
          classItem("middle", "2026-06-23T16:00:00Z"),
        ]}
        timeZone="America/Los_Angeles"
        nextClassId="early"
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Monday, June 22, 2026",
      "Tuesday, June 23, 2026",
    ]);
    const secondDay = headings[1]?.closest("section");
    expect(within(secondDay!).getAllByRole("heading", { level: 3 }).map((h) => h.textContent))
      .toEqual(["Class middle", "Class late"]);
  });

  it("emphasizes exactly the globally established next class", () => {
    const { container } = render(
      <Agenda
        classes={[
          classItem("past", "2026-06-22T15:00:00Z"),
          classItem("canceled-next", "2026-06-22T16:00:00Z", "canceled"),
          classItem("next", "2026-06-22T17:00:00Z"),
          classItem("later", "2026-06-22T18:00:00Z"),
        ]}
        timeZone="UTC"
        nextClassId="next"
      />,
    );

    expect(screen.getAllByText("Next class")).toHaveLength(1);
    expect(container.querySelectorAll('[data-next="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-next="true"] h3')).toHaveTextContent("Class next");
  });

  it("does not badge a viewed future month when an earlier global class intervenes", () => {
    const { container } = render(
      <Agenda
        classes={[
          classItem("future-one", "2026-08-01T17:00:00Z"),
          classItem("future-two", "2026-08-02T17:00:00Z"),
        ]}
        timeZone="UTC"
        nextClassId="intervening-july-class"
      />,
    );

    expect(screen.queryByText("Next class")).not.toBeInTheDocument();
    expect(container.querySelector('[data-next="true"]')).not.toBeInTheDocument();
  });

  it("renders the exact empty-state copy", () => {
    render(<Agenda classes={[]} timeZone="UTC" nextClassId={null} />);
    expect(screen.getByText("No classes scheduled")).toBeInTheDocument();
  });
});
