// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "@/app/api/calendar-feed/route";
import { generateFeedToken, feedTokensMatch, isWellFormedFeedToken } from "@/features/calendar-feed/token";

const TOKEN = "a".repeat(43);

function feedClient({
  storedToken = TOKEN,
  classes = [
    {
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Algebra I",
      description: null,
      teacher_name: "Ada Lovelace",
      starts_at: "2026-07-01T23:00:00.000Z",
      ends_at: "2026-07-02T00:00:00.000Z",
      zoom_url: "https://school.zoom.us/j/123",
      status: "scheduled",
    },
  ],
}: {
  storedToken?: string | null;
  classes?: unknown[];
} = {}) {
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
            return Promise.resolve({
              data: { display_name: "Sunrise School", calendar_feed_token: storedToken },
              error: null,
            });
          },
        };
      }
      return {
        select() {
          return this;
        },
        gte() {
          return this;
        },
        lt() {
          return this;
        },
        order() {
          return Promise.resolve({ data: classes, error: null });
        },
      };
    },
  };
}

function feedRequest(token: string | null): NextRequest {
  const url = new URL("https://calendar.example.org/api/calendar-feed");
  if (token !== null) url.searchParams.set("token", token);
  return new NextRequest(url);
}

describe("feed tokens", () => {
  it("generates well-formed unique tokens", () => {
    const one = generateFeedToken();
    const two = generateFeedToken();
    expect(isWellFormedFeedToken(one)).toBe(true);
    expect(one).not.toBe(two);
  });

  it("rejects malformed tokens", () => {
    expect(isWellFormedFeedToken("short")).toBe(false);
    expect(isWellFormedFeedToken("bad token with spaces".padEnd(40, "x"))).toBe(false);
    expect(isWellFormedFeedToken("")).toBe(false);
  });

  it("matches only equal tokens", () => {
    expect(feedTokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(feedTokensMatch(TOKEN, "b".repeat(43))).toBe(false);
    expect(feedTokensMatch(TOKEN, TOKEN + "x")).toBe(false);
  });
});

describe("calendar feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(feedClient());
  });

  it("returns the calendar for a matching token", async () => {
    const response = await GET(feedRequest(TOKEN));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Algebra I");
    expect(body).toContain("X-WR-CALNAME:Sunrise School");
  });

  it("rejects missing or malformed tokens without touching the database", async () => {
    expect((await GET(feedRequest(null))).status).toBe(404);
    expect((await GET(feedRequest("short"))).status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a mismatched token", async () => {
    const response = await GET(feedRequest("b".repeat(43)));
    expect(response.status).toBe(404);
  });

  it("rejects any token when none is configured", async () => {
    mocks.createAdminClient.mockReturnValue(feedClient({ storedToken: null }));
    const response = await GET(feedRequest(TOKEN));
    expect(response.status).toBe(404);
  });
});
