import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessForm } from "@/features/parent-access/access-form";

afterEach(cleanup);

describe("AccessForm", () => {
  it("provides an accessible password field and submit control", () => {
    render(<AccessForm action={vi.fn(async () => ({ ok: false, error: "Invalid access code" }))} />);
    expect(screen.getByLabelText("Access code")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Access code")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "View calendar" })).toBeEnabled();
  });

  it("shows the generic action error in an accessible status region", async () => {
    const user = userEvent.setup();
    render(<AccessForm action={vi.fn(async () => ({ ok: false, error: "Invalid access code" }))} />);
    await user.type(screen.getByLabelText("Access code"), "wrong");
    await user.click(screen.getByRole("button", { name: "View calendar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invalid access code");
  });
});
