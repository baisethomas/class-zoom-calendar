import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const createServerClient = vi.fn();
const clearSupabaseAuthCookies = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerClient,
  clearSupabaseAuthCookies,
}));

const ADMIN_ID = "54a66d5f-d5dd-4d2d-8e06-a3703a86f77d";

function form(email = "admin@example.com", password = "secret") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

function client(options: {
  user?: Record<string, unknown> | null;
  getUserError?: unknown;
  loginError?: unknown;
  signOutError?: unknown;
  signOutReject?: unknown;
} = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? { id: ADMIN_ID } : options.user },
        error: options.getUserError ?? null,
      })),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: options.loginError ?? null })),
      signOut: vi.fn(async () => {
        if (options.signOutReject) throw options.signOutReject;
        return { error: options.signOutError ?? null };
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_USER_ID = ADMIN_ID;
});

describe("requireAdmin", () => {
  it("redirects generically when creating the auth client rejects", async () => {
    createServerClient.mockRejectedValueOnce(new Error("internal Supabase configuration detail"));
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("redirects generically when verified-user lookup rejects", async () => {
    const supabase = client();
    supabase.auth.getUser.mockRejectedValueOnce(new Error("provider network detail"));
    createServerClient.mockResolvedValue(supabase);
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it.each([
    ["no session", { user: null }],
    ["authentication error", { user: null, getUserError: new Error("expired") }],
    ["wrong immutable user id", { user: { id: "49016c44-266c-4504-9274-3f70f842c5a8", email: "admin@example.com" } }],
    ["matching email and metadata but wrong id", { user: { id: "49016c44-266c-4504-9274-3f70f842c5a8", email: "admin@example.com", user_metadata: { admin: true } } }],
  ])("redirects for %s", async (_name, options) => {
    const supabase = client(options);
    createServerClient.mockResolvedValue(supabase);
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "not-a-uuid", "54A66D5F-D5DD-4D2D-8E06-A3703A86F77D"])(
    "fails closed for an invalid ADMIN_USER_ID value (%s)",
    async (value) => {
      if (value === undefined) delete process.env.ADMIN_USER_ID;
      else process.env.ADMIN_USER_ID = value;
      const supabase = client();
      createServerClient.mockResolvedValue(supabase);
      const { requireAdmin } = await import("@/features/admin/auth");

      await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    },
  );

  it("returns only the verified user", async () => {
    const user = { id: ADMIN_ID, email: "admin@example.com" };
    const supabase = client({ user });
    createServerClient.mockResolvedValue(supabase);
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).resolves.toBe(user);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });
});

describe("admin login", () => {
  it("signs in, verifies the immutable user id, then redirects to the fixed admin path", async () => {
    const supabase = client();
    createServerClient.mockResolvedValue(supabase);
    const { loginAdmin } = await import("@/features/admin/auth");

    await expect(loginAdmin(undefined, form())).rejects.toThrow("REDIRECT:/admin");
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "secret",
    });
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("returns one generic error for invalid credentials", async () => {
    const supabase = client({ loginError: new Error("specific provider detail") });
    createServerClient.mockResolvedValue(supabase);
    const { loginAdmin } = await import("@/features/admin/auth");

    await expect(loginAdmin(undefined, form())).resolves.toEqual({
      ok: false,
      error: "Invalid email or password",
    });
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("signs out and denies a successfully authenticated non-admin", async () => {
    const supabase = client({ user: { id: "49016c44-266c-4504-9274-3f70f842c5a8" } });
    createServerClient.mockResolvedValue(supabase);
    const { loginAdmin } = await import("@/features/admin/auth");

    await expect(loginAdmin(undefined, form())).resolves.toEqual({
      ok: false,
      error: "Invalid email or password",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears Supabase auth cookies when local wrong-user signout fails", async () => {
    const supabase = client({
      user: { id: "49016c44-266c-4504-9274-3f70f842c5a8" },
      signOutError: new Error("provider detail"),
    });
    createServerClient.mockResolvedValue(supabase);
    const { loginAdmin } = await import("@/features/admin/auth");

    await expect(loginAdmin(undefined, form())).resolves.toEqual({
      ok: false,
      error: "Invalid email or password",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("clears Supabase auth cookies when local wrong-user signout rejects", async () => {
    const supabase = client({
      user: { id: "49016c44-266c-4504-9274-3f70f842c5a8" },
      signOutReject: new Error("provider detail"),
    });
    createServerClient.mockResolvedValue(supabase);
    const { loginAdmin } = await import("@/features/admin/auth");

    await expect(loginAdmin(undefined, form())).resolves.toEqual({
      ok: false,
      error: "Invalid email or password",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });
});

describe("admin logout", () => {
  it("redirects only after Supabase confirms sign out", async () => {
    const supabase = client();
    createServerClient.mockResolvedValue(supabase);
    const { logoutAdmin } = await import("@/features/admin/auth");
    await expect(logoutAdmin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("returns a retryable error and stays put when sign out fails", async () => {
    const supabase = client({ signOutError: new Error("network") });
    createServerClient.mockResolvedValue(supabase);
    const { logoutAdmin } = await import("@/features/admin/auth");
    await expect(logoutAdmin()).resolves.toEqual({
      ok: false,
      error: "Unable to sign out. Please try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
