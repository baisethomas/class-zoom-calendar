// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => { throw new Error(`redirect:${path}`); });
const cookieGet = vi.fn();
const createAdminClient = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

function schoolNameClient(displayName: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: displayName === null ? null : { display_name: displayName },
              error: null,
            }),
        }),
      }),
    }),
  };
}

describe("root page", () => {
  beforeEach(() => {
    vi.resetModules();
    redirect.mockClear();
    cookieGet.mockReset();
    createAdminClient.mockReset();
    process.env.PARENT_SESSION_SECRET = "a-secure-parent-session-secret-of-32-bytes";
  });

  it("redirects a valid parent session to the calendar", async () => {
    const { createParentSession } = await import("@/features/parent-access/session");
    const token = await createParentSession({ now: new Date(), durationHours: 2 });
    cookieGet.mockReturnValue({ value: token });
    const { default: Home } = await import("@/app/page");

    await expect(Home()).rejects.toThrow("redirect:/calendar");
  });

  it("renders the landing page when there is no session", async () => {
    cookieGet.mockReturnValue(undefined);
    createAdminClient.mockReturnValue(schoolNameClient("Homeroom Demo School"));
    const { default: Home } = await import("@/app/page");

    const result = await Home();

    expect(redirect).not.toHaveBeenCalled();
    expect(result.props.className).toBe("landing-page");
  });

  it("still renders the landing when the school name is unavailable", async () => {
    cookieGet.mockReturnValue(undefined);
    createAdminClient.mockImplementation(() => {
      throw new Error("service configuration missing");
    });
    const { default: Home } = await import("@/app/page");

    const result = await Home();

    expect(result.props.className).toBe("landing-page");
  });
});
