import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.fn();

vi.mock("@supabase/ssr", () => ({ createServerClient }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
});

describe("admin auth refresh proxy", () => {
  it("reads request cookies and propagates every refreshed cookie to request and response", async () => {
    createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: vi.fn(async () => {
          expect(options.cookies.getAll()).toEqual([
            expect.objectContaining({ name: "existing", value: "yes" }),
          ]);
          options.cookies.setAll([
            { name: "sb-project-auth-token", value: "fresh", options: { httpOnly: true } },
            { name: "sb-project-auth-token.0", value: "chunk", options: { sameSite: "lax" } },
          ], {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
            Expires: "0",
            Pragma: "no-cache",
          });
          return { data: { user: null }, error: null };
        }),
      },
    }));
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("https://example.test/admin", {
      headers: { cookie: "existing=yes" },
    });

    const response = await proxy(request);

    expect(createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "public-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("fresh");
    expect(response.cookies.get("sb-project-auth-token.0")?.value).toBe("chunk");
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-project-auth-token=fresh");
  });

  it("matches every admin route including login, but no unrelated route", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toEqual(["/admin/:path*"]);
  });

  it("continues the request when the refresh lookup rejects", async () => {
    createServerClient.mockImplementation(() => ({
      auth: {
        getUser: vi.fn(async () => {
          throw new Error("provider detail");
        }),
      },
    }));
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("https://example.test/admin");

    const response = await proxy(request);

    expect(response.status).toBe(200);
  });
});
