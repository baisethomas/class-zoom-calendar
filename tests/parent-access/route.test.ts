// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteCookie = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ delete: deleteCookie })) }));

describe("DELETE /api/parent-session", () => {
  beforeEach(() => deleteCookie.mockClear());

  it("clears the parent session cookie with matching scope", async () => {
    const { DELETE } = await import("@/app/api/parent-session/route");
    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(deleteCookie).toHaveBeenCalledWith({
      name: "parent_session",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
