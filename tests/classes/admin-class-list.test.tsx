import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminClassList } from "@/features/classes/admin-class-list";

afterEach(cleanup);

const classes = [
  {
    id: "123e4567-e89b-12d3-a456-426614174000",
    title: "Algebra I",
    description: "Linear equations",
    teacher_name: "Ada Lovelace",
    starts_at: "2026-07-01T23:00:00.000Z",
    ends_at: "2026-07-02T00:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/123",
    status: "scheduled",
    series_id: null,
  },
  {
    id: "123e4567-e89b-12d3-a456-426614174001",
    title: "Past Art",
    description: null,
    teacher_name: "Frida Kahlo",
    starts_at: "2026-06-01T17:00:00.000Z",
    ends_at: "2026-06-01T18:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/456",
    status: "canceled",
    series_id: null,
  },
];

describe("AdminClassList", () => {
  it("shows upcoming classes first, recently past classes second, visible status, and edit links", () => {
    render(
      <AdminClassList
        classes={classes}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={vi.fn()}
        duplicateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    const upcoming = screen.getByRole("region", { name: "Upcoming classes" });
    const past = screen.getByRole("region", { name: "Recently past classes" });
    expect(within(upcoming).getByText("Algebra I")).toBeInTheDocument();
    expect(within(upcoming).getByText("Scheduled")).toBeInTheDocument();
    expect(within(upcoming).getByRole("link", { name: "Edit Algebra I" })).toHaveAttribute(
      "href",
      "/admin/classes/123e4567-e89b-12d3-a456-426614174000/edit",
    );
    expect(within(past).getByText("Past Art")).toBeInTheDocument();
    expect(within(past).getByText("Canceled")).toBeInTheDocument();
  });

  it("requires normal confirmation before canceling or restoring", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const setStatusAction = vi.fn();

    render(
      <AdminClassList
        classes={classes}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={setStatusAction}
        duplicateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel Algebra I" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Algebra I"));
    expect(setStatusAction).not.toHaveBeenCalled();
  });

  it("announces cancel or restore failures returned by the server action", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const setStatusAction = vi.fn(async () => ({
      ok: false as const,
      error: "Unable to update class. Please try again.",
    }));

    render(
      <AdminClassList
        classes={classes}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={setStatusAction}
        duplicateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel Algebra I" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update class. Please try again.",
    );
  });

  it("requires a dialog with the class name before delete can be submitted", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn();

    render(
      <AdminClassList
        classes={classes.slice(0, 1)}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={vi.fn()}
        duplicateAction={vi.fn()}
        deleteAction={deleteAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Algebra I" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Algebra I" });
    expect(dialog).toHaveTextContent("Algebra I");
    expect(within(dialog).getByRole("button", { name: "Permanently delete" })).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Type Algebra I to confirm"), "Algebra I");
    await user.click(within(dialog).getByRole("button", { name: "Permanently delete" }));

    expect(deleteAction).toHaveBeenCalledTimes(1);
    const submitted = deleteAction.mock.calls[0]?.[0] as FormData;
    expect(submitted.get("confirmTitle")).toBe("Algebra I");
  });

  it("moves focus into the delete dialog, closes with Escape, and restores opener focus", async () => {
    const user = userEvent.setup();

    render(
      <AdminClassList
        classes={classes.slice(0, 1)}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={vi.fn()}
        duplicateAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );

    const opener = screen.getByRole("button", { name: "Delete Algebra I" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Delete Algebra I" });
    expect(within(dialog).getByLabelText("Type Algebra I to confirm")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Delete Algebra I" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("announces delete failures returned by the server action", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn(async () => ({
      ok: false as const,
      error: "Unable to delete class. Please try again.",
    }));

    render(
      <AdminClassList
        classes={classes.slice(0, 1)}
        timeZone="America/Los_Angeles"
        now="2026-06-24T12:00:00.000Z"
        setStatusAction={vi.fn()}
        duplicateAction={vi.fn()}
        deleteAction={deleteAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Algebra I" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Algebra I" });
    await user.type(within(dialog).getByLabelText("Type Algebra I to confirm"), "Algebra I");
    await user.click(within(dialog).getByRole("button", { name: "Permanently delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Unable to delete class. Please try again.",
    );
  });
});
