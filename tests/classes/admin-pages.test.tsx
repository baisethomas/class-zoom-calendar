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

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(cleanup);

function classesPageClient() {
  const calls: Array<[string, ...unknown[]]> = [];
  const classesQuery = {
    select(fields: string) {
      calls.push(["classes.select", fields]);
      return this;
    },
    gte(column: string, value: string) {
      calls.push(["classes.gte", column, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(["classes.order", column, options]);
      return Promise.resolve({
        data: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            title: "Algebra I",
            description: null,
            teacher_name: "Ada Lovelace",
            starts_at: "2026-07-01T23:00:00.000Z",
            ends_at: "2026-07-02T00:00:00.000Z",
            zoom_url: "https://school.zoom.us/j/1",
            status: "scheduled",
          },
        ],
        error: null,
      });
    },
  };
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
        data: { timezone: "America/Los_Angeles" },
        error: null,
      });
    },
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return table === "school_settings" ? settingsQuery : classesQuery;
      },
    },
  };
}

describe("administrator class pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  it("requires admin before loading service-client class data for /admin/classes", async () => {
    const order: string[] = [];
    const admin = classesPageClient();
    mocks.requireAdmin.mockImplementation(async () => {
      order.push("admin");
      return { id: "admin" };
    });
    mocks.createAdminClient.mockImplementation(() => {
      order.push("service");
      return admin.client;
    });
    const { default: ClassesPage } = await import("@/app/admin/(protected)/classes/page");

    render(await ClassesPage());

    expect(order).toEqual(["admin", "service"]);
    expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New class" })).toHaveAttribute(
      "href",
      "/admin/classes/new",
    );
    expect(screen.getByText("Algebra I")).toBeInTheDocument();
  });
});
