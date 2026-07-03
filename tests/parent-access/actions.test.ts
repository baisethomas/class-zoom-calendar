import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { processParentAccess } from "@/features/parent-access/service";

function form(code: string) {
  const data = new FormData();
  data.set("accessCode", code);
  return data;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: vi.fn(() => "hashed-client"),
    consumeAttempt: vi.fn(async () => true),
    loadSettings: vi.fn(async () => ({ access_code_hash: "stored-hash", parent_session_hours: 8 })),
    compareCode: vi.fn(async () => true),
    createSession: vi.fn(async () => "signed-token"),
    setSessionCookie: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("parent access", () => {
  it("consumes the rate-limit attempt before loading settings or comparing", async () => {
    const order: string[] = [];
    const deps = dependencies({
      consumeAttempt: vi.fn(async () => { order.push("rate-limit"); return true; }),
      loadSettings: vi.fn(async () => { order.push("settings"); return { access_code_hash: "hash", parent_session_hours: 8 }; }),
      compareCode: vi.fn(async () => { order.push("compare"); return true; }),
    });

    await processParentAccess(form("  family code  "), deps);
    expect(order).toEqual(["rate-limit", "settings", "compare"]);
    expect(deps.consumeAttempt).toHaveBeenCalledWith("hashed-client", 5, 900);
    expect(deps.compareCode).toHaveBeenCalledWith("family code", "hash");
  });

  it("returns a temporary generic error and stops when rate limited", async () => {
    const deps = dependencies({ consumeAttempt: vi.fn(async () => false) });
    const result = await processParentAccess(form("secret"), deps);

    expect(result).toEqual({ ok: false, error: "Too many attempts. Please try again later." });
    expect(deps.loadSettings).not.toHaveBeenCalled();
    expect(deps.compareCode).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.setSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["missing settings", null],
    ["missing hash", { access_code_hash: null, parent_session_hours: 8 }],
  ])("returns the same generic error for %s", async (_name, settings) => {
    const deps = dependencies({ loadSettings: vi.fn(async () => settings) });
    await expect(processParentAccess(form("not echoed"), deps)).resolves.toEqual({
      ok: false,
      error: "Invalid access code",
    });
    expect(deps.compareCode).not.toHaveBeenCalled();
  });

  it("returns the generic error for a wrong code without creating a session", async () => {
    const deps = dependencies({ compareCode: vi.fn(async () => false) });
    const result = await processParentAccess(form("wrong"), deps);
    expect(result).toEqual({ ok: false, error: "Invalid access code" });
    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.setSessionCookie).not.toHaveBeenCalled();
  });

  it("sets a session cookie only for a valid code", async () => {
    const deps = dependencies();
    const result = await processParentAccess(form("right"), deps);
    expect(result).toEqual({ ok: true });
    expect(deps.createSession).toHaveBeenCalledWith(8);
    expect(deps.setSessionCookie).toHaveBeenCalledWith("signed-token", 8);
  });

  it("rejects oversized input before privileged work", async () => {
    const deps = dependencies();
    const result = await processParentAccess(form("x".repeat(257)), deps);
    expect(result).toEqual({ ok: false, error: "Invalid access code" });
    expect(deps.consumeAttempt).not.toHaveBeenCalled();
  });

  it("rejects an ASCII code that bcrypt would truncate after rate limiting", async () => {
    const base = "a".repeat(72);
    const deps = dependencies({
      loadSettings: vi.fn(async () => ({
        access_code_hash: await bcrypt.hash(base, 4),
        parent_session_hours: 8,
      })),
      compareCode: vi.fn(bcrypt.compare),
    });

    const result = await processParentAccess(form(`${base}different`), deps);
    expect(result).toEqual({ ok: false, error: "Invalid access code" });
    expect(deps.consumeAttempt).toHaveBeenCalledTimes(1);
    expect(deps.loadSettings).not.toHaveBeenCalled();
    expect(deps.compareCode).not.toHaveBeenCalled();
  });

  it("rejects a multibyte code that bcrypt would truncate after rate limiting", async () => {
    const base = "é".repeat(36);
    const deps = dependencies({
      loadSettings: vi.fn(async () => ({
        access_code_hash: await bcrypt.hash(base, 4),
        parent_session_hours: 8,
      })),
      compareCode: vi.fn(bcrypt.compare),
    });

    const result = await processParentAccess(form(`${base}suffix`), deps);
    expect(result).toEqual({ ok: false, error: "Invalid access code" });
    expect(deps.consumeAttempt).toHaveBeenCalledTimes(1);
    expect(deps.loadSettings).not.toHaveBeenCalled();
    expect(deps.compareCode).not.toHaveBeenCalled();
  });
});
