import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassForm } from "@/features/classes/class-form";
import type { ClassFormValues } from "@/features/classes/admin-actions";

afterEach(cleanup);

const initialValues = {
  title: "Algebra I",
  description: "Linear equations",
  teacherName: "Ada Lovelace",
  date: "2026-07-01",
  startTime: "16:00",
  endTime: "17:00",
  zoomUrl: "https://school.zoom.us/j/123456789",
};

describe("ClassForm", () => {
  it("renders accessible labeled fields and supports edit initial values", () => {
    render(<ClassForm action={vi.fn()} initialValues={initialValues} submitLabel="Save class" />);

    expect(screen.getByLabelText("Title")).toHaveValue("Algebra I");
    expect(screen.getByLabelText("Description")).toHaveValue("Linear equations");
    expect(screen.getByLabelText("Teacher")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Start time")).toHaveValue("16:00");
    expect(screen.getByLabelText("End time")).toHaveValue("17:00");
    expect(screen.getByLabelText("Zoom URL")).toHaveValue("https://school.zoom.us/j/123456789");
    expect(screen.getByRole("button", { name: "Save class" })).toBeEnabled();
  });

  it("preserves submitted values, focuses an announced summary, and renders field errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (_previousState, formData: FormData) => ({
      ok: false as const,
      formError: "Please fix the highlighted fields.",
      fieldErrors: {
        title: ["Title is required"],
        zoomUrl: ["Must be a safe Zoom HTTPS URL"],
      },
      values: {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        teacherName: String(formData.get("teacherName") ?? ""),
        date: String(formData.get("date") ?? ""),
        startTime: String(formData.get("startTime") ?? ""),
        endTime: String(formData.get("endTime") ?? ""),
        zoomUrl: String(formData.get("zoomUrl") ?? ""),
      } satisfies ClassFormValues,
    }));

    render(<ClassForm action={action} submitLabel="Create class" />);

    await user.type(screen.getByLabelText("Title"), "Intro Music");
    await user.type(screen.getByLabelText("Teacher"), "Nina Simone");
    await user.type(screen.getByLabelText("Date"), "2026-07-01");
    await user.type(screen.getByLabelText("Start time"), "16:00");
    await user.type(screen.getByLabelText("End time"), "17:00");
    await user.type(screen.getByLabelText("Zoom URL"), "https://evil.example");
    await user.click(screen.getByRole("button", { name: "Create class" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Please fix the highlighted fields.");
    expect(summary).toHaveFocus();
    expect(screen.getByLabelText("Title")).toHaveValue("Intro Music");
    expect(screen.getByLabelText("Zoom URL")).toHaveValue("https://evil.example");
    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Must be a safe Zoom HTTPS URL")).toBeInTheDocument();
  });

  it("disables the submit button while the server action is pending", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: { ok: true }) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<ClassForm action={action} initialValues={initialValues} submitLabel="Save class" />);

    await user.click(screen.getByRole("button", { name: "Save class" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    resolveAction({ ok: true });
  });
});
