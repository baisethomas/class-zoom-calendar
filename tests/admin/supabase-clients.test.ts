import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const noStore = vi.fn();
type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    values: { name: string; value: string; options: Record<string, unknown> }[],
    headers?: Record<string, string>,
  ) => void;
};
const createServerClient = vi.fn(
  (...args: [string, string, { cookies: CookieAdapter }]) => {
    void args;
    return { kind: "server" };
  },
);
const createBrowserClient = vi.fn((...args: [string, string]) => {
  void args;
  return { kind: "browser" };
});

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/cache", () => ({ unstable_noStore: noStore }));
vi.mock("@supabase/ssr", () => ({ createServerClient, createBrowserClient }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-be-used";
});

describe("server Supabase client", () => {
  it("clears only Supabase auth cookie chunks", async () => {
    const store = {
      getAll: vi.fn(() => [
        { name: "sb-project-auth-token", value: "token" },
        { name: "sb-project-auth-token.0", value: "chunk" },
        { name: "sb-project-preferences", value: "keep" },
        { name: "unrelated", value: "keep" },
      ]),
      set: vi.fn(),
    };
    cookies.mockResolvedValue(store);
    const { clearSupabaseAuthCookies } = await import("@/lib/supabase/server");

    await clearSupabaseAuthCookies();

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenCalledWith("sb-project-auth-token", "", expect.objectContaining({ maxAge: 0 }));
    expect(store.set).toHaveBeenCalledWith("sb-project-auth-token.0", "", expect.objectContaining({ maxAge: 0 }));
  });

  it("adapts async Next cookies and persists every auth cookie", async () => {
    const store = {
      getAll: vi.fn(() => [{ name: "existing", value: "yes" }]),
      set: vi.fn(),
    };
    cookies.mockResolvedValue(store);
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    await expect(createServerSupabaseClient()).resolves.toEqual({ kind: "server" });
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "public-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    const adapter = createServerClient.mock.calls[0]![2].cookies;
    expect(adapter.getAll()).toEqual([{ name: "existing", value: "yes" }]);
    adapter.setAll([{ name: "token", value: "value", options: { httpOnly: true } }], {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
    });
    expect(store.set).toHaveBeenCalledWith("token", "value", { httpOnly: true });
    expect(noStore).toHaveBeenCalledTimes(1);
  });

  it("ignores only the known Server Component cookie-write restriction", async () => {
    const set = vi.fn(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    cookies.mockResolvedValue({ getAll: () => [], set });
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    await createServerSupabaseClient();
    const adapter = createServerClient.mock.calls[0]![2].cookies;
    expect(() => adapter.setAll([{ name: "a", value: "b", options: {} }])).not.toThrow();

    set.mockImplementation(() => { throw new Error("disk exploded"); });
    expect(() => adapter.setAll([{ name: "a", value: "b", options: {} }])).toThrow("disk exploded");
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "rejects missing %s",
    async (name) => {
      delete process.env[name];
      cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
      const { createServerSupabaseClient } = await import("@/lib/supabase/server");
      await expect(createServerSupabaseClient()).rejects.toThrow(name);
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );
});

describe("browser Supabase client", () => {
  it("uses only the public URL and publishable key", async () => {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase/browser");
    expect(createBrowserSupabaseClient()).toEqual({ kind: "browser" });
    expect(createBrowserClient).toHaveBeenCalledWith("https://example.supabase.co", "public-key");
    expect(JSON.stringify(createBrowserClient.mock.calls)).not.toContain("must-not-be-used");
  });
});
