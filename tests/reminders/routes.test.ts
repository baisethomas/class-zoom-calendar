// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendReminderDigest: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/features/reminders/send", () => ({
  sendReminderDigest: mocks.sendReminderDigest,
}));

import { GET as cronGet } from "@/app/api/reminder-cron/route";
import { GET as unsubscribeGet } from "@/app/api/reminder-unsubscribe/route";

const CRON_SECRET = "cron-secret-value";

function cronRequest(authorization?: string): NextRequest {
  return new NextRequest("https://calendar.example.org/api/reminder-cron", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("reminder cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.RESEND_API_KEY = "resend-key";
    process.env.REMINDER_FROM_EMAIL = "school@example.org";
    mocks.sendReminderDigest.mockResolvedValue({
      status: "sent",
      subscribers: 1,
      classes: 2,
      failures: 0,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.REMINDER_FROM_EMAIL;
  });

  it("rejects requests without the cron secret", async () => {
    expect((await cronGet(cronRequest())).status).toBe(401);
    expect((await cronGet(cronRequest("Bearer wrong"))).status).toBe(401);
    expect(mocks.sendReminderDigest).not.toHaveBeenCalled();
  });

  it("rejects all requests when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await cronGet(cronRequest(`Bearer ${CRON_SECRET}`))).status).toBe(401);
  });

  it("runs the digest for an authorized request", async () => {
    const response = await cronGet(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "sent",
      subscribers: 1,
      classes: 2,
      failures: 0,
    });
    expect(mocks.sendReminderDigest).toHaveBeenCalledWith({
      now: expect.any(Date),
      origin: "https://calendar.example.org",
    });
  });

  it("reports skipped when email delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const response = await cronGet(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "skipped" });
    expect(mocks.sendReminderDigest).not.toHaveBeenCalled();
  });
});

describe("reminder unsubscribe route", () => {
  const TOKEN = "u".repeat(43);

  function unsubscribeRequest(token: string | null): NextRequest {
    const url = new URL("https://calendar.example.org/api/reminder-unsubscribe");
    if (token !== null) url.searchParams.set("token", token);
    return new NextRequest(url);
  }

  function unsubscribeClient({ error = null }: { error?: { message: string } | null } = {}) {
    const calls: Array<[string, ...unknown[]]> = [];
    return {
      calls,
      client: {
        from(table: string) {
          calls.push(["from", table]);
          return {
            delete() {
              calls.push(["delete"]);
              return {
                eq(column: string, value: string) {
                  calls.push(["eq", column, value]);
                  return Promise.resolve({ data: null, error });
                },
              };
            },
          };
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the subscription for a well-formed token", async () => {
    const admin = unsubscribeClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const response = await unsubscribeGet(unsubscribeRequest(TOKEN));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("unsubscribed");
    expect(admin.calls).toContainEqual(["eq", "unsubscribe_token", TOKEN]);
  });

  it("rejects malformed tokens without touching the database", async () => {
    const response = await unsubscribeGet(unsubscribeRequest("short"));

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
