// @vitest-environment node

import bcrypt from "bcryptjs";
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
  rotateParentAccessCode,
  updateSchoolSettings,
} from "@/features/settings/admin-actions";

function settingsForm(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    displayName: "Evergreen Learning",
    timezone: "America/Los_Angeles",
    parentSessionHours: "48",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function accessCodeForm(value: string) {
  const data = new FormData();
  data.set("accessCode", value);
  return data;
}

function adminClient(settingsError: { message: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const settingsQuery = {
    update(payload: unknown) {
      calls.push(["settings.update", payload]);
      return this;
    },
    eq(column: string, value: boolean) {
      calls.push(["settings.eq", column, value]);
      return Promise.resolve({ data: null, error: settingsError });
    },
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return settingsQuery;
      },
    },
  };
}

describe("administrator settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("updates school settings only after admin authorization and valid raw input", async () => {
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

    const result = await updateSchoolSettings(undefined, settingsForm({
      displayName: "  Evergreen Learning 🌲  ",
    }));

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["admin", "service"]);
    expect(admin.calls).toContainEqual([
      "settings.update",
      {
        display_name: "Evergreen Learning 🌲",
        timezone: "America/Los_Angeles",
        parent_session_hours: 48,
      },
    ]);
    expect(admin.calls).toContainEqual(["settings.eq", "id", true]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/access");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("preserves values and avoids a service client for invalid settings input after admin auth", async () => {
    const result = await updateSchoolSettings(undefined, settingsForm({
      displayName: " ",
      timezone: "Mars/Base",
      parentSessionHours: "169",
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.values.displayName).toBe(" ");
      expect(result.fieldErrors.displayName).toBeDefined();
      expect(result.fieldErrors.timezone).toBeDefined();
      expect(result.fieldErrors.parentSessionHours).toBeDefined();
    }
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects offset-style timezone identifiers before service-client use", async () => {
    const result = await updateSchoolSettings(undefined, settingsForm({ timezone: "+01:00" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.timezone).toEqual(["Timezone must be a valid IANA timezone"]);
    }
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns a generic settings error without leaking database details", async () => {
    const admin = adminClient({ message: "private table policy detail" });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await updateSchoolSettings(undefined, settingsForm());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toBe("Unable to save settings. Please try again.");
      expect(result.formError).not.toContain("policy");
    }
  });

  it("stores only a bcrypt hash when rotating the parent access code", async () => {
    const admin = adminClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await rotateParentAccessCode(undefined, accessCodeForm("  family-code-2026  "));

    expect(result).toEqual({ ok: true });
    const update = admin.calls.find((call) => call[0] === "settings.update");
    expect(update).toBeDefined();
    const payload = update?.[1] as { access_code_hash: string };
    expect(payload.access_code_hash).not.toBe("family-code-2026");
    expect(payload.access_code_hash).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare("family-code-2026", payload.access_code_hash)).resolves.toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/access");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/calendar");
  });

  it("rejects empty, oversized, and bcrypt-truncated access codes before service-client use", async () => {
    for (const value of [" ", "a".repeat(257), "🚀".repeat(40)]) {
      vi.clearAllMocks();
      mocks.requireAdmin.mockResolvedValue({ id: "admin" });

      const result = await rotateParentAccessCode(undefined, accessCodeForm(value));

      expect(result.ok).toBe(false);
      expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  });
});
