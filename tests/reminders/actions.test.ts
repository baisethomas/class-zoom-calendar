// @vitest-environment node

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

import { subscribeToReminders } from "@/features/reminders/actions";

function subscribeClient({ error = null }: { error?: { message: string } | null } = {}) {
  const upserts: Array<{ payload: unknown; options: unknown }> = [];
  return {
    upserts,
    client: {
      from() {
        return {
          upsert(payload: unknown, options: unknown) {
            upserts.push({ payload, options });
            return Promise.resolve({ data: null, error });
          },
        };
      },
    },
  };
}

function emailForm(email: unknown): FormData {
  const data = new FormData();
  if (typeof email === "string") data.set("email", email);
  return data;
}

describe("subscribeToReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCookie.mockReturnValue({ value: "session-token" });
    mocks.verifyParentSession.mockResolvedValue({ scope: "parent" });
  });

  it("stores a normalized email with a fresh unsubscribe token", async () => {
    const admin = subscribeClient();
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await subscribeToReminders(undefined, emailForm("  Parent@Example.ORG "));

    expect(result).toEqual({ ok: true });
    expect(admin.upserts).toHaveLength(1);
    const { payload, options } = admin.upserts[0]!;
    expect(payload).toMatchObject({ email: "parent@example.org" });
    expect((payload as { unsubscribe_token: string }).unsubscribe_token).toMatch(
      /^[A-Za-z0-9_-]{40,}$/,
    );
    expect(options).toMatchObject({ onConflict: "email", ignoreDuplicates: true });
  });

  it("requires a valid parent session before touching the database", async () => {
    mocks.verifyParentSession.mockResolvedValue(null);

    const result = await subscribeToReminders(undefined, emailForm("parent@example.org"));

    expect(result.ok).toBe(false);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["", "not-an-email", "a@", `${"x".repeat(320)}@example.org`])(
    "rejects invalid email %s",
    async (email) => {
      const result = await subscribeToReminders(undefined, emailForm(email));

      expect(result.ok).toBe(false);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    },
  );

  it("returns a generic error for database failures", async () => {
    const admin = subscribeClient({ error: { message: "secret detail" } });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const result = await subscribeToReminders(undefined, emailForm("parent@example.org"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("secret");
  });
});
