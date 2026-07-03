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

import { duplicateClass, importClasses } from "@/features/classes/admin-actions";

const CLASS_ID = "123e4567-e89b-12d3-a456-426614174000";
const CSV_HEADER = "title,teacher,date,start_time,end_time,zoom_url,description";

function actionsClient({
  timezone = "America/Los_Angeles",
  existing = {
    title: "Algebra I",
    description: "Linear equations",
    teacher_name: "Ada Lovelace",
    starts_at: "2026-10-28T23:00:00.000Z",
    ends_at: "2026-10-29T00:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/123",
  },
}: {
  timezone?: string;
  existing?: Record<string, string> | null;
} = {}) {
  const inserts: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === "school_settings") {
        return {
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
      }
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return Promise.resolve({
            data: existing,
            error: existing ? null : { message: "missing" },
          });
        },
        insert(payload: unknown) {
          inserts.push(payload);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client, inserts };
}

describe("duplicateClass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("copies the class one week later at the same school-local time across DST", async () => {
    const admin = actionsClient();
    mocks.createAdminClient.mockReturnValue(admin.client);
    const data = new FormData();
    data.set("id", CLASS_ID);

    const result = await duplicateClass(data);

    expect(result).toEqual({ ok: true });
    expect(admin.inserts).toHaveLength(1);
    // Original is 16:00-17:00 PDT on Oct 28; the copy lands after the fall-back
    // so the same wall-clock time is 00:00Z/01:00Z.
    expect(admin.inserts[0]).toMatchObject({
      title: "Algebra I",
      teacher_name: "Ada Lovelace",
      starts_at: "2026-11-05T00:00:00.000Z",
      ends_at: "2026-11-05T01:00:00.000Z",
      status: "scheduled",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("rejects invalid ids before touching the database", async () => {
    const data = new FormData();
    data.set("id", "nope");

    const result = await duplicateClass(data);

    expect(result.ok).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe("importClasses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  function csvForm(csv: string): FormData {
    const data = new FormData();
    data.set("csv", csv);
    return data;
  }

  it("imports every valid row in one insert", async () => {
    const admin = actionsClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await importClasses(
      undefined,
      csvForm(
        `${CSV_HEADER}\n` +
          "Algebra I,Ada Lovelace,2026-09-01,16:00,17:00,https://school.zoom.us/j/1,Notes\n" +
          "Art,Frida Kahlo,2026-09-02,10:00,11:00,https://school.zoom.us/j/2,",
      ),
    );

    expect(result).toEqual({ ok: true, imported: 2 });
    expect(admin.inserts).toHaveLength(1);
    const rows = admin.inserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Algebra I",
      starts_at: "2026-09-01T23:00:00.000Z",
      status: "scheduled",
    });
    expect(rows[1]).toMatchObject({ title: "Art", description: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("imports nothing when any row is invalid and reports each bad row", async () => {
    const admin = actionsClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await importClasses(
      undefined,
      csvForm(
        `${CSV_HEADER}\n` +
          "Algebra I,Ada Lovelace,2026-09-01,16:00,17:00,https://school.zoom.us/j/1,\n" +
          "Bad Times,Ada,2026-09-02,17:00,16:00,https://school.zoom.us/j/2,\n" +
          "Bad URL,Ada,2026-09-03,10:00,11:00,https://evil.example,",
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rowErrors).toHaveLength(2);
      expect(result.rowErrors[0]).toMatchObject({ row: 3 });
      expect(result.rowErrors[1]).toMatchObject({ row: 4 });
    }
    expect(admin.inserts).toHaveLength(0);
  });

  it("rejects empty input", async () => {
    const result = await importClasses(undefined, csvForm("   "));
    expect(result.ok).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
