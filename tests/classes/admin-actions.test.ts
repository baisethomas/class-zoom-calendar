// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/admin/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  createClass,
  deleteClass,
  setClassStatus,
  updateClass,
} from "@/features/classes/admin-actions";

const CLASS_ID = "123e4567-e89b-12d3-a456-426614174000";

function classForm(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    title: "Algebra I",
    description: "Linear equations",
    teacherName: "Ada Lovelace",
    date: "2026-07-01",
    startTime: "16:00",
    endTime: "17:00",
    zoomUrl: "https://school.zoom.us/j/123456789?pwd=abc",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function adminClient({
  timezone = "America/Los_Angeles",
  classError = null,
  existingTitle = "Algebra I",
}: {
  timezone?: string;
  classError?: { message: string } | null;
  existingTitle?: string | null;
} = {}) {
  const calls: Array<[string, ...unknown[]]> = [];

  const settingsQuery = {
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
      return Promise.resolve({ data: { timezone }, error: null });
    },
  };

  const titleLookup = {
    select(fields: string) {
      calls.push(["classes.select", fields]);
      return this;
    },
    eq(column: string, value: string) {
      calls.push(["classes.eq", column, value]);
      return this;
    },
    single() {
      calls.push(["classes.single"]);
      return Promise.resolve({
        data: existingTitle === null ? null : { title: existingTitle },
        error: existingTitle === null ? { message: "missing private detail" } : null,
      });
    },
  };

  const classQuery = {
    insert(payload: unknown) {
      calls.push(["classes.insert", payload]);
      return Promise.resolve({ data: null, error: classError });
    },
    update(payload: unknown) {
      calls.push(["classes.update", payload]);
      return {
        eq(column: string, value: string) {
          calls.push(["classes.eq", column, value]);
          return Promise.resolve({ data: null, error: classError });
        },
      };
    },
    delete() {
      calls.push(["classes.delete"]);
      return {
        eq(column: string, value: string) {
          calls.push(["classes.eq", column, value]);
          return Promise.resolve({ data: null, error: classError });
        },
      };
    },
    ...titleLookup,
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return table === "school_settings" ? settingsQuery : classQuery;
      },
    },
  };
}

describe("administrator class actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("requires an administrator before creating a service client", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementation(async () => {
      order.push("admin");
      return { id: "admin" };
    });
    const admin = adminClient();
    mocks.createAdminClient.mockImplementation(() => {
      order.push("service");
      return admin.client;
    });

    await createClass(undefined, classForm());

    expect(order).toEqual(["admin", "service"]);
  });

  it("does not create a service client for invalid create input", async () => {
    const result = await createClass(undefined, classForm({ title: " ", zoomUrl: "https://evil.example" }));

    expect(result.ok).toBe(false);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("stores school-local create times as UTC instants and revalidates class views", async () => {
    const admin = adminClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await createClass(undefined, classForm());

    expect(result).toEqual({ ok: true });
    expect(admin.calls).toContainEqual(["from", "school_settings"]);
    expect(admin.calls).toContainEqual([
      "classes.insert",
      {
        title: "Algebra I",
        description: "Linear equations",
        teacher_name: "Ada Lovelace",
        starts_at: "2026-07-01T23:00:00.000Z",
        ends_at: "2026-07-02T00:00:00.000Z",
        zoom_url: "https://school.zoom.us/j/123456789?pwd=abc",
        status: "scheduled",
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/classes");
  });

  it("returns a generic form error for database failures", async () => {
    const admin = adminClient({ classError: { message: "duplicate key secret detail" } });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await createClass(undefined, classForm());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toBe("Unable to save class. Please try again.");
      expect(result.formError).not.toContain("duplicate");
    }
  });

  it("updates classes only after admin authorization and valid form input", async () => {
    const order: string[] = [];
    const admin = adminClient();
    mocks.requireAdmin.mockImplementation(async () => {
      order.push("admin");
      return { id: "admin" };
    });
    mocks.createAdminClient.mockImplementation(() => {
      order.push("service");
      return admin.client;
    });

    const result = await updateClass(CLASS_ID, undefined, classForm({ title: "Geometry" }));

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["admin", "service"]);
    expect(admin.calls).toContainEqual([
      "classes.update",
      expect.objectContaining({
        title: "Geometry",
        starts_at: "2026-07-01T23:00:00.000Z",
      }),
    ]);
    expect(admin.calls).toContainEqual(["classes.eq", "id", CLASS_ID]);
  });

  it("does not mutate when update input is invalid", async () => {
    const result = await updateClass(CLASS_ID, undefined, classForm({ endTime: "15:00" }));

    expect(result.ok).toBe(false);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["canceled", "Cancel"],
    ["scheduled", "Restore"],
  ])("%s status changes require admin and revalidate safe paths", async (status) => {
    const admin = adminClient();
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_ID);
    data.set("status", status);

    const result = await setClassStatus(data);

    expect(result).toEqual({ ok: true });
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(admin.calls).toContainEqual(["classes.update", { status }]);
    expect(admin.calls).toContainEqual(["classes.eq", "id", CLASS_ID]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/classes");
  });

  it("rejects invalid status changes before mutation", async () => {
    const data = new FormData();
    data.set("id", CLASS_ID);
    data.set("status", "deleted");

    const result = await setClassStatus(data);

    expect(result.ok).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("requires an exact class-name confirmation before permanent deletion", async () => {
    const admin = adminClient({ existingTitle: "Algebra I" });
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_ID);
    data.set("confirmTitle", "wrong");

    const result = await deleteClass(data);

    expect(result.ok).toBe(false);
    expect(admin.calls).not.toContainEqual(["classes.delete"]);
  });

  it("deletes only after admin authorization, class lookup, exact confirmation, and revalidation", async () => {
    const admin = adminClient({ existingTitle: "Algebra I" });
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_ID);
    data.set("confirmTitle", "Algebra I");

    const result = await deleteClass(data);

    expect(result).toEqual({ ok: true });
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(admin.calls).toContainEqual(["classes.select", "title,starts_at,series_id"]);
    expect(admin.calls).toContainEqual(["classes.delete"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/classes");
  });
});
