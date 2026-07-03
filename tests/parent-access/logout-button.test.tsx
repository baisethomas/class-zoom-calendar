import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "@/features/parent-access/logout-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LogoutButton", () => {
  it("redirects to access only after the session deletion succeeds", async () => {
    const navigate = vi.fn();
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    render(<LogoutButton navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(request).toHaveBeenCalledWith("/api/parent-session", { method: "DELETE" });
    expect(navigate).toHaveBeenCalledWith("/access");
  });

  it("stays put and announces a retryable error after a non-success response", async () => {
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(<LogoutButton navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t sign out. Please try again.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("stays put and announces the same error after a network failure", async () => {
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));

    render(<LogoutButton navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t sign out. Please try again.");
    expect(screen.queryByText(/private network detail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
