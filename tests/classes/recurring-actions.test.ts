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

import { createClass, deleteClass, updateClass } from "@/features/classes/admin-actions";

const SERIES_ID = "123e4567-e89b-12d3-a456-426614174111";
const CLASS_B = "123e4567-e89b-12d3-a456-426614174002";
const CLASS_C = "123e4567-e89b-12d3-a456-426614174003";

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

type SeriesRow = { id: string; starts_at: string };

function seriesClient({
  timezone = "America/Los_Angeles",
  target = null,
  members = [],
  deleteTarget = null,
}: {
  timezone?: string;
  target?: { starts_at: string; series_id: string | null } | null;
  members?: SeriesRow[];
  deleteTarget?: { title: string; starts_at: string; series_id: string | null } | null;
} = {}) {
  const calls: Array<[string, ...unknown[]]> = [];

  const settingsQuery = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    single() {
      return Promise.resolve({ data: { timezone }, error: null });
    },
  };

  function classesQuery() {
    let selected = "";
    let deleting = false;
    return {
      select(fields: string) {
        selected = fields;
        calls.push(["classes.select", fields]);
        return this;
      },
      eq(column: string, value: unknown) {
        calls.push([deleting ? "classes.delete.eq" : "classes.eq", column, value]);
        return this;
      },
      gte(column: string, value: unknown) {
        calls.push([deleting ? "classes.delete.gte" : "classes.gte", column, value]);
        if (deleting) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: members, error: null });
      },
      single() {
        if (selected === "starts_at,series_id") {
          return Promise.resolve({ data: target, error: target ? null : { message: "missing" } });
        }
        return Promise.resolve({
          data: deleteTarget,
          error: deleteTarget ? null : { message: "missing" },
        });
      },
      insert(payload: unknown) {
        calls.push(["classes.insert", payload]);
        return Promise.resolve({ data: null, error: null });
      },
      update(payload: unknown) {
        calls.push(["classes.update", payload]);
        return {
          eq(column: string, value: unknown) {
            calls.push(["classes.update.eq", column, value]);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      delete() {
        deleting = true;
        calls.push(["classes.delete"]);
        return this;
      },
    };
  }

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return table === "school_settings" ? settingsQuery : classesQuery();
      },
    },
  };
}

describe("recurring class creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("creates one row per week sharing a series id, DST-safe", async () => {
    const admin = seriesClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await createClass(
      undefined,
      classForm({ date: "2026-10-28", repeat: "weekly", repeatUntil: "2026-11-04" }),
    );

    expect(result).toEqual({ ok: true });
    const insert = admin.calls.find(([name]) => name === "classes.insert");
    expect(insert).toBeDefined();
    const rows = insert![1] as Array<Record<string, string>>;
    expect(rows).toHaveLength(2);
    // 16:00 local is 23:00Z in PDT and 00:00Z (next day) after the fall-back.
    expect(rows[0]!.starts_at).toBe("2026-10-28T23:00:00.000Z");
    expect(rows[1]!.starts_at).toBe("2026-11-05T00:00:00.000Z");
    expect(rows[0]!.series_id).toBeDefined();
    expect(rows[0]!.series_id).toBe(rows[1]!.series_id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("rejects a repeat end date before the class date without touching the database", async () => {
    const result = await createClass(
      undefined,
      classForm({ repeat: "weekly", repeatUntil: "2026-06-30" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.repeatUntil).toBeDefined();
    }
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an unknown repeat mode", async () => {
    const result = await createClass(undefined, classForm({ repeat: "daily" }));

    expect(result.ok).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe("editing a series occurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("applies field, time, and date-shift changes to this and future occurrences", async () => {
    const admin = seriesClient({
      target: { starts_at: "2026-07-08T23:00:00.000Z", series_id: SERIES_ID },
      members: [
        { id: CLASS_B, starts_at: "2026-07-08T23:00:00.000Z" },
        { id: CLASS_C, starts_at: "2026-07-15T23:00:00.000Z" },
      ],
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const form = classForm({
      title: "Algebra II",
      date: "2026-07-09",
      startTime: "10:00",
      endTime: "11:00",
    });
    form.set("applyTo", "future");

    const result = await updateClass(CLASS_B, undefined, form);

    expect(result).toEqual({ ok: true });
    expect(admin.calls).toContainEqual(["classes.eq", "series_id", SERIES_ID]);
    expect(admin.calls).toContainEqual(["classes.gte", "starts_at", "2026-07-08T23:00:00.000Z"]);

    const updates = admin.calls.filter(([name]) => name === "classes.update");
    expect(updates).toHaveLength(2);
    // Both occurrences shift one day later and take the new 10:00-11:00 slot (17:00Z in PDT).
    expect(updates[0]![1]).toMatchObject({
      title: "Algebra II",
      starts_at: "2026-07-09T17:00:00.000Z",
      ends_at: "2026-07-09T18:00:00.000Z",
    });
    expect(updates[1]![1]).toMatchObject({
      starts_at: "2026-07-16T17:00:00.000Z",
      ends_at: "2026-07-16T18:00:00.000Z",
    });
    expect(admin.calls).toContainEqual(["classes.update.eq", "id", CLASS_B]);
    expect(admin.calls).toContainEqual(["classes.update.eq", "id", CLASS_C]);
  });

  it("updates only the single class when it does not belong to a series", async () => {
    const admin = seriesClient({
      target: { starts_at: "2026-07-08T23:00:00.000Z", series_id: null },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const form = classForm();
    form.set("applyTo", "future");

    const result = await updateClass(CLASS_B, undefined, form);

    expect(result).toEqual({ ok: true });
    const updates = admin.calls.filter(([name]) => name === "classes.update");
    expect(updates).toHaveLength(1);
    expect(admin.calls).toContainEqual(["classes.update.eq", "id", CLASS_B]);
  });
});

describe("deleting series occurrences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("deletes this and future occurrences when scoped to the series", async () => {
    const admin = seriesClient({
      deleteTarget: {
        title: "Algebra I",
        starts_at: "2026-07-08T23:00:00.000Z",
        series_id: SERIES_ID,
      },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_B);
    data.set("confirmTitle", "Algebra I");
    data.set("scope", "future");

    const result = await deleteClass(data);

    expect(result).toEqual({ ok: true });
    expect(admin.calls).toContainEqual(["classes.delete"]);
    expect(admin.calls).toContainEqual(["classes.delete.eq", "series_id", SERIES_ID]);
    expect(admin.calls).toContainEqual(["classes.delete.gte", "starts_at", "2026-07-08T23:00:00.000Z"]);
  });

  it("deletes a single class when the future scope is requested outside a series", async () => {
    const admin = seriesClient({
      deleteTarget: { title: "Algebra I", starts_at: "2026-07-08T23:00:00.000Z", series_id: null },
    });
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_B);
    data.set("confirmTitle", "Algebra I");
    data.set("scope", "future");

    const result = await deleteClass(data);

    expect(result).toEqual({ ok: true });
    expect(admin.calls).toContainEqual(["classes.delete.eq", "id", CLASS_B]);
  });
});
