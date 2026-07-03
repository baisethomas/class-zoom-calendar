import { describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();

vi.mock("@/features/admin/auth", () => ({
  requireAdmin,
  logoutAdmin: vi.fn(),
}));
vi.mock("@/features/admin/logout-form", () => ({ LogoutForm: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

describe("protected admin layout", () => {
  it("does not return navigation or children when authorization fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("redirected"));
    const { default: ProtectedAdminLayout } = await import("@/app/admin/(protected)/layout");

    await expect(ProtectedAdminLayout({ children: <p>private child</p> })).rejects.toThrow("redirected");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});
