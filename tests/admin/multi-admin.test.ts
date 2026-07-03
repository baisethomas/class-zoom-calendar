// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const createServerClient = vi.fn();
const clearSupabaseAuthCookies = vi.fn();
const createAdminClient = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerClient,
  clearSupabaseAuthCookies,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const BOOTSTRAP_ID = "54a66d5f-d5dd-4d2d-8e06-a3703a86f77d";
const SECOND_ADMIN_ID = "49016c44-266c-4504-9274-3f70f842c5a8";
const OUTSIDER_ID = "11111111-2222-4333-8444-555555555555";

function authClient(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

function adminsTableClient(knownAdminIds: string[]) {
  return {
    from(table: string) {
      if (table !== "admins") throw new Error(`unexpected table ${table}`);
      let requestedId = "";
      return {
        select() {
          return this;
        },
        eq(_column: string, value: string) {
          requestedId = value;
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: knownAdminIds.includes(requestedId) ? { user_id: requestedId } : null,
            error: null,
          });
        },
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_USER_ID = BOOTSTRAP_ID;
});

describe("multi-admin authorization", () => {
  it("admits an administrator from the admins table", async () => {
    createServerClient.mockResolvedValue(authClient(SECOND_ADMIN_ID));
    createAdminClient.mockReturnValue(adminsTableClient([SECOND_ADMIN_ID]));
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).resolves.toMatchObject({ id: SECOND_ADMIN_ID });
  });

  it("still admits the bootstrap administrator without querying the table", async () => {
    createServerClient.mockResolvedValue(authClient(BOOTSTRAP_ID));
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).resolves.toMatchObject({ id: BOOTSTRAP_ID });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a user in neither the env nor the table", async () => {
    createServerClient.mockResolvedValue(authClient(OUTSIDER_ID));
    createAdminClient.mockReturnValue(adminsTableClient([SECOND_ADMIN_ID]));
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("fails closed when the admins lookup throws", async () => {
    createServerClient.mockResolvedValue(authClient(OUTSIDER_ID));
    createAdminClient.mockImplementation(() => {
      throw new Error("configuration missing");
    });
    const { requireAdmin } = await import("@/features/admin/auth");

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("lets a table administrator sign in", async () => {
    createServerClient.mockResolvedValue(authClient(SECOND_ADMIN_ID));
    createAdminClient.mockReturnValue(adminsTableClient([SECOND_ADMIN_ID]));
    const { loginAdmin } = await import("@/features/admin/auth");

    const data = new FormData();
    data.set("email", "second@example.org");
    data.set("password", "secret");

    await expect(loginAdmin(undefined, data)).rejects.toThrow("REDIRECT:/admin");
  });
});

describe("administrator management actions", () => {
  function manageClient({ knownAdmins = [] as string[] } = {}) {
    const calls: Array<[string, ...unknown[]]> = [];
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            calls.push(["eq", column, value]);
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
          upsert(payload: unknown, options: unknown) {
            calls.push(["upsert", payload, options]);
            return Promise.resolve({ data: null, error: null });
          },
          delete() {
            calls.push(["delete"]);
            return {
              eq(column: string, value: unknown) {
                calls.push(["delete.eq", column, value]);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      },
    };
    void knownAdmins;
    return { calls, client };
  }

  beforeEach(() => {
    createServerClient.mockResolvedValue(authClient(BOOTSTRAP_ID));
  });

  it("adds an administrator with a normalized user id", async () => {
    const admin = manageClient();
    createAdminClient.mockReturnValue(admin.client);
    const { addAdmin } = await import("@/features/settings/admin-actions");

    const data = new FormData();
    data.set("userId", SECOND_ADMIN_ID.toUpperCase());
    data.set("label", "Second teacher");

    await expect(addAdmin(undefined, data)).resolves.toEqual({ ok: true });
    expect(admin.calls).toContainEqual([
      "upsert",
      { user_id: SECOND_ADMIN_ID, label: "Second teacher" },
      { onConflict: "user_id" },
    ]);
  });

  it("rejects malformed user ids", async () => {
    const admin = manageClient();
    createAdminClient.mockReturnValue(admin.client);
    const { addAdmin } = await import("@/features/settings/admin-actions");

    const data = new FormData();
    data.set("userId", "not-a-uuid");

    const result = await addAdmin(undefined, data);
    expect(result.ok).toBe(false);
    expect(admin.calls).not.toContainEqual(expect.arrayContaining(["upsert"]));
  });

  it("removes an administrator", async () => {
    const admin = manageClient();
    createAdminClient.mockReturnValue(admin.client);
    const { removeAdmin } = await import("@/features/settings/admin-actions");

    const data = new FormData();
    data.set("userId", SECOND_ADMIN_ID);

    await expect(removeAdmin(data)).resolves.toEqual({ ok: true });
    expect(admin.calls).toContainEqual(["delete.eq", "user_id", SECOND_ADMIN_ID]);
  });

  it("refuses to remove your own access", async () => {
    const admin = manageClient();
    createAdminClient.mockReturnValue(admin.client);
    const { removeAdmin } = await import("@/features/settings/admin-actions");

    const data = new FormData();
    data.set("userId", BOOTSTRAP_ID);

    const result = await removeAdmin(data);
    expect(result).toEqual({ ok: false, error: "You cannot remove your own access." });
    expect(admin.calls).not.toContainEqual(["delete"]);
  });
});
