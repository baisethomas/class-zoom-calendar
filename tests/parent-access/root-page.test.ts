// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => { throw new Error(`redirect:${path}`); });
const cookieGet = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));

describe("root page", () => {
  beforeEach(() => {
    vi.resetModules();
    redirect.mockClear();
    cookieGet.mockReset();
    process.env.PARENT_SESSION_SECRET = "a-secure-parent-session-secret-of-32-bytes";
  });

  it("redirects a valid parent session to the calendar", async () => {
    const { createParentSession } = await import("@/features/parent-access/session");
    const token = await createParentSession({ now: new Date(), durationHours: 2 });
    cookieGet.mockReturnValue({ value: token });
    const { default: Home } = await import("@/app/page");

    await expect(Home()).rejects.toThrow("redirect:/calendar");
  });

  it("redirects a missing session to access", async () => {
    cookieGet.mockReturnValue(undefined);
    const { default: Home } = await import("@/app/page");
    await expect(Home()).rejects.toThrow("redirect:/access");
  });
});
