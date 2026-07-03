import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/features/admin/login-form";

afterEach(cleanup);

describe("LoginForm", () => {
  it("labels credential inputs with password-manager autocomplete hints", () => {
    render(<LoginForm action={vi.fn(async () => ({ ok: false as const, error: "Invalid email or password" }))} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("announces the generic credentials error", async () => {
    const user = userEvent.setup();
    render(<LoginForm action={vi.fn(async () => ({ ok: false as const, error: "Invalid email or password" }))} />);
    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invalid email or password");
  });
});
