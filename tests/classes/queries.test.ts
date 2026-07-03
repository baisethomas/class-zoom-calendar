// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/features/parent-access/session", () => ({
  verifyParentSession: mocks.verify,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getNextParentClass, getParentClasses } from "@/features/classes/queries";

const CLASS_FIELDS =
  "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status";

function adminClient({
  classError = null,
  settingsError = null,
}: {
  classError?: { message: string } | null;
  settingsError?: { message: string } | null;
} = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const classes = {
    select(fields: string) {
      calls.push(["classes.select", fields]);
      return this;
    },
    gte(column: string, value: string) {
      calls.push(["classes.gte", column, value]);
      return this;
    },
    lt(column: string, value: string) {
      calls.push(["classes.lt", column, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(["classes.order", column, options]);
      return Promise.resolve({
        data: classError ? null : [{ id: "class-1", title: "Math" }],
        error: classError,
      });
    },
  };
  const settings = {
    select(fields: string) {
      calls.push(["settings.select", fields]);
      return this;
    },
    eq(column: string, value: boolean) {
      calls.push(["settings.eq", column, value]);
      return this;
    },
    single() {
      calls.push(["settings.single"]);
      return Promise.resolve({
        data: settingsError
          ? null
          : { display_name: "North Star School", timezone: "America/Los_Angeles" },
        error: settingsError,
      });
    },
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return table === "classes" ? classes : settings;
      },
    },
  };
}

describe("getParentClasses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ scope: "parent" });
  });

  it("verifies the parent session before creating a privileged database client", async () => {
    const order: string[] = [];
    mocks.verify.mockImplementation(async () => {
      order.push("verify");
      return null;
    });
    mocks.createAdminClient.mockImplementation(() => {
      order.push("database");
      return {};
    });

    await expect(
      getParentClasses({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-07-01T00:00:00.000Z",
        sessionToken: "bad-token",
      }),
    ).rejects.toThrow("Unauthorized");
    expect(order).toEqual(["verify"]);
  });

  it("selects only renderable fields in the exact bounded range and ascending order", async () => {
    const admin = adminClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await getParentClasses({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
      sessionToken: "valid-token",
    });

    expect(mocks.verify).toHaveBeenCalledWith("valid-token");
    expect(admin.calls).toEqual([
      ["from", "classes"],
      ["classes.select", CLASS_FIELDS],
      ["classes.gte", "starts_at", "2026-06-01T00:00:00.000Z"],
      ["classes.lt", "starts_at", "2026-07-01T00:00:00.000Z"],
      ["classes.order", "starts_at", { ascending: true }],
      ["from", "school_settings"],
      ["settings.select", "display_name,timezone"],
      ["settings.eq", "id", true],
      ["settings.single"],
    ]);
    expect(result).toEqual({
      classes: [{ id: "class-1", title: "Math" }],
      school: { display_name: "North Star School", timezone: "America/Los_Angeles" },
    });
  });

  it.each([
    ["invalid from", "not-a-date", "2026-07-01T00:00:00.000Z"],
    ["impossible date", "2026-02-30T00:00:00.000Z", "2026-03-15T00:00:00.000Z"],
    ["reversed", "2026-07-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"],
    ["too large", "2026-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
  ])("rejects a %s range before creating a database client", async (_label, from, to) => {
    await expect(
      getParentClasses({ from, to, sessionToken: "valid-token" }),
    ).rejects.toThrow("Invalid calendar range");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["class query", { classError: { message: "secret database detail" } }],
    ["settings query", { settingsError: { message: "access_code_hash leaked" } }],
  ])("sanitizes a %s failure", async (_label, setup) => {
    const admin = adminClient(setup);
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(
      getParentClasses({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-07-01T00:00:00.000Z",
        sessionToken: "valid-token",
      }),
    ).rejects.toThrow("Unable to load calendar");
  });
});

function nextAdminClient({ error = null }: { error?: { message: string } | null } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(fields: string) {
      calls.push(["select", fields]);
      return this;
    },
    gte(column: string, value: string) {
      calls.push(["gte", column, value]);
      return this;
    },
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(count: number) {
      calls.push(["limit", count]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve({
        data: error ? null : { id: "global-next", title: "Soonest class" },
        error,
      });
    },
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

describe("getNextParentClass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ scope: "parent" });
  });

  it("fails closed before creating a privileged database client", async () => {
    mocks.verify.mockResolvedValue(null);

    await expect(
      getNextParentClass({ from: "2026-06-22T16:00:00.000Z", sessionToken: "bad" }),
    ).rejects.toThrow("Unauthorized");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("retrieves only the first globally scheduled future class", async () => {
    const admin = nextAdminClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await getNextParentClass({
      from: "2026-06-22T16:00:00.000Z",
      sessionToken: "valid-token",
    });

    expect(admin.calls).toEqual([
      ["from", "classes"],
      ["select", CLASS_FIELDS],
      ["gte", "starts_at", "2026-06-22T16:00:00.000Z"],
      ["eq", "status", "scheduled"],
      ["order", "starts_at", { ascending: true }],
      ["limit", 1],
      ["maybeSingle"],
    ]);
    expect(result).toEqual({ id: "global-next", title: "Soonest class" });
  });

  it("sanitizes next-class query failures", async () => {
    const admin = nextAdminClient({ error: { message: "private database detail" } });
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(
      getNextParentClass({ from: "2026-06-22T16:00:00.000Z", sessionToken: "valid" }),
    ).rejects.toThrow("Unable to load calendar");
  });
});
