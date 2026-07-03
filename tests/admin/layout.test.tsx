import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const usePathname = vi.fn();

vi.mock("@/features/admin/auth", () => ({
  requireAdmin,
  logoutAdmin: vi.fn(),
}));
vi.mock("@/features/admin/logout-form", () => ({ LogoutForm: () => null }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href?: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("protected admin layout", () => {
  it("does not return navigation or children when authorization fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("redirected"));
    const { default: ProtectedAdminLayout } = await import("@/app/admin/(protected)/layout");

    await expect(ProtectedAdminLayout({ children: <p>private child</p> })).rejects.toThrow("redirected");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("marks the current admin section in navigation", async () => {
    requireAdmin.mockResolvedValue({ id: "admin" });
    usePathname.mockReturnValue("/admin/settings");
    const { default: ProtectedAdminLayout } = await import("@/app/admin/(protected)/layout");

    render(await ProtectedAdminLayout({ children: <p>private child</p> }));

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Classes" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the parent section active on nested admin routes", async () => {
    requireAdmin.mockResolvedValue({ id: "admin" });
    usePathname.mockReturnValue("/admin/classes/new");
    const { default: ProtectedAdminLayout } = await import("@/app/admin/(protected)/layout");

    render(await ProtectedAdminLayout({ children: <p>private child</p> }));

    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("aria-current", "page");
  });
});
