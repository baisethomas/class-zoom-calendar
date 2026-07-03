import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccessCodeForm,
  SchoolSettingsForm,
} from "@/features/settings/settings-forms";
import type {
  AccessCodeFormState,
  SchoolSettingsFormValues,
} from "@/features/settings/admin-actions";

afterEach(cleanup);

const initialSettings = {
  displayName: "Evergreen Learning",
  timezone: "America/Los_Angeles",
  parentSessionHours: "48",
};

describe("administrator settings forms", () => {
  it("renders accessible school settings fields with current values", () => {
    render(<SchoolSettingsForm action={vi.fn()} initialValues={initialSettings} />);

    expect(screen.getByLabelText("School display name")).toHaveValue("Evergreen Learning");
    expect(screen.getByLabelText("Timezone")).toHaveValue("America/Los_Angeles");
    expect(screen.getByLabelText("Parent session duration")).toHaveValue(48);
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled();
  });

  it("preserves settings values, focuses an announced summary, and renders field errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (_previousState, formData: FormData) => ({
      ok: false as const,
      formError: "Please fix the highlighted fields.",
      fieldErrors: {
        displayName: ["Display name is required"],
        timezone: ["Timezone must be a valid IANA timezone"],
      },
      values: {
        displayName: String(formData.get("displayName") ?? ""),
        timezone: String(formData.get("timezone") ?? ""),
        parentSessionHours: String(formData.get("parentSessionHours") ?? ""),
      } satisfies SchoolSettingsFormValues,
    }));

    render(<SchoolSettingsForm action={action} initialValues={initialSettings} />);

    await user.clear(screen.getByLabelText("School display name"));
    await user.type(screen.getByLabelText("School display name"), "Updated School");
    await user.clear(screen.getByLabelText("Timezone"));
    await user.type(screen.getByLabelText("Timezone"), "Mars/Base");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Please fix the highlighted fields.");
    expect(summary).toHaveFocus();
    expect(screen.getByLabelText("School display name")).toHaveValue("Updated School");
    expect(screen.getByLabelText("Timezone")).toHaveValue("Mars/Base");
    expect(screen.getByText("Display name is required")).toBeInTheDocument();
    expect(screen.getByText("Timezone must be a valid IANA timezone")).toBeInTheDocument();
  });

  it("renders an access code form that never pre-fills a code and disables while pending", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: AccessCodeFormState) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<AccessCodeFormState>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<AccessCodeForm action={action} hasAccessCode />);

    const form = screen.getByRole("form", { name: "Parent access code" });
    expect(within(form).getByLabelText("New shared access code")).toHaveValue("");
    expect(screen.getByText("An access code is currently configured.")).toBeInTheDocument();

    await user.type(within(form).getByLabelText("New shared access code"), "family-code");
    await user.click(within(form).getByRole("button", { name: "Set access code" }));

    expect(within(form).getByRole("button", { name: "Saving…" })).toBeDisabled();
    resolveAction({ ok: true });
  });
});
