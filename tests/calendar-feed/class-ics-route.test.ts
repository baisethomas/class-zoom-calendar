// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  verifyParentSession: vi.fn(),
  getCookie: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/features/parent-access/session", () => ({
  PARENT_SESSION_COOKIE: "parent_session",
  verifyParentSession: mocks.verifyParentSession,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.getCookie })),
}));

import { GET } from "@/app/api/class-ics/route";

const CLASS_ID = "123e4567-e89b-12d3-a456-426614174000";

function icsClient({ classItem = defaultClass() }: { classItem?: unknown } = {}) {
  return {
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
            return Promise.resolve({ data: { display_name: "Sunrise School" }, error: null });
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
        maybeSingle() {
          return Promise.resolve({ data: classItem, error: null });
        },
      };
    },
  };
}

function defaultClass() {
  return {
    id: CLASS_ID,
    title: "Algebra I",
    description: null,
    teacher_name: "Ada Lovelace",
    starts_at: "2026-07-01T23:00:00.000Z",
    ends_at: "2026-07-02T00:00:00.000Z",
    zoom_url: "https://school.zoom.us/j/123",
    status: "scheduled",
  };
}

function icsRequest(id: string): NextRequest {
  const url = new URL("https://calendar.example.org/api/class-ics");
  url.searchParams.set("id", id);
  return new NextRequest(url);
}

describe("class ICS download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCookie.mockReturnValue({ value: "session-token" });
    mocks.verifyParentSession.mockResolvedValue({ scope: "parent" });
    mocks.createAdminClient.mockReturnValue(icsClient());
  });

  it("returns a downloadable single-event calendar for a valid parent session", async () => {
    const response = await GET(icsRequest(CLASS_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    const body = await response.text();
    expect(body).toContain("SUMMARY:Algebra I");
  });

  it("rejects requests without a valid parent session before touching the database", async () => {
    mocks.verifyParentSession.mockResolvedValue(null);

    const response = await GET(icsRequest(CLASS_ID));

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects malformed class ids", async () => {
    const response = await GET(icsRequest("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing class", async () => {
    mocks.createAdminClient.mockReturnValue(icsClient({ classItem: null }));
    const response = await GET(icsRequest(CLASS_ID));
    expect(response.status).toBe(404);
  });
});
