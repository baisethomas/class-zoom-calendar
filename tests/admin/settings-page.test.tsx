import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/features/admin/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/features/settings/settings-forms", () => ({
  SchoolSettingsForm: ({ initialValues }: { initialValues: Record<string, string> }) => (
    <form aria-label="School settings">
      <input aria-label="School display name" defaultValue={initialValues.displayName} />
      <input aria-label="Timezone" defaultValue={initialValues.timezone} />
      <input
        aria-label="Parent session duration"
        defaultValue={initialValues.parentSessionHours}
      />
    </form>
  ),
  AccessCodeForm: ({ hasAccessCode }: { hasAccessCode: boolean }) => (
    <form aria-label="Parent access code">
      {hasAccessCode ? "An access code is currently configured." : "No access code is configured."}
    </form>
  ),
}));

afterEach(cleanup);

function settingsPageClient() {
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
      return Promise.resolve({
        data: {
          display_name: "Evergreen Learning",
          timezone: "America/Los_Angeles",
          access_code_hash: "$2b$hash",
          parent_session_hours: 48,
          updated_at: "2026-06-24T15:30:00.000Z",
        },
        error: null,
      });
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

describe("administrator settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("requires admin before loading current school settings and never renders the hash", async () => {
    const order: string[] = [];
    const admin = settingsPageClient();
    mocks.requireAdmin.mockImplementation(async () => {
      order.push("admin");
      return { id: "admin" };
    });
    mocks.createAdminClient.mockImplementation(() => {
      order.push("service");
      return admin.client;
    });
    const { default: SettingsPage } = await import("@/app/admin/(protected)/settings/page");

    render(await SettingsPage());

    expect(order).toEqual(["admin", "service"]);
    expect(admin.calls).toContainEqual([
      "settings.select",
      "display_name,timezone,access_code_hash,parent_session_hours,updated_at",
    ]);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("School display name")).toHaveValue("Evergreen Learning");
    expect(screen.getByLabelText("Timezone")).toHaveValue("America/Los_Angeles");
    expect(screen.getByLabelText("Parent session duration")).toHaveValue("48");
    expect(screen.getByText("An access code is currently configured.")).toBeInTheDocument();
    expect(screen.getByText(/updated/i)).toHaveTextContent("Updated");
    expect(screen.queryByText("$2b$hash")).not.toBeInTheDocument();
  });
});
