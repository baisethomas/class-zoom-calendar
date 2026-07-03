// @vitest-environment node

import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PARENT_SESSION_COOKIE,
  createParentSession,
  parentSessionCookieOptions,
  verifyParentSession,
} from "@/features/parent-access/session";

const SECRET = "a-secure-parent-session-secret-of-32-bytes";
const NOW = new Date("2026-06-22T12:00:00.000Z");
const ISSUER = "class-calendar";
const AUDIENCE = "parent-calendar";

function signClaims(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(Uint8Array.from(Buffer.from(SECRET)));
}

describe("parent sessions", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.PARENT_SESSION_SECRET;
  });

  it("creates a valid parent-scoped token with the expected expiry", async () => {
    const token = await createParentSession({ now: NOW, durationHours: 6 });
    const claims = await verifyParentSession(token, NOW);

    expect(PARENT_SESSION_COOKIE).toBe("parent_session");
    expect(claims).toMatchObject({
      scope: "parent",
      iss: ISSUER,
      aud: AUDIENCE,
      iat: Math.floor(NOW.getTime() / 1000),
      exp: Math.floor(NOW.getTime() / 1000) + 6 * 60 * 60,
    });
  });

  it("rejects tampered tokens", async () => {
    const token = await createParentSession({ now: NOW, durationHours: 1 });
    await expect(verifyParentSession(`${token.slice(0, -1)}x`, NOW)).resolves.toBeNull();
  });

  it("rejects a token with the wrong scope", async () => {
    const secret = Uint8Array.from(Buffer.from(SECRET));
    const token = await new SignJWT({ scope: "admin", iss: ISSUER, aud: AUDIENCE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 3600)
      .sign(secret);

    await expect(verifyParentSession(token, NOW)).resolves.toBeNull();
  });

  it.each([
    ["issued-at", { scope: "parent", iss: ISSUER, aud: AUDIENCE, exp: Math.floor(NOW.getTime() / 1000) + 3600 }],
    ["expiry", { scope: "parent", iss: ISSUER, aud: AUDIENCE, iat: Math.floor(NOW.getTime() / 1000) }],
  ])("rejects a token missing its %s claim", async (_claim, payload) => {
    await expect(verifyParentSession(await signClaims(payload), NOW)).resolves.toBeNull();
  });

  it("rejects a token issued in the future", async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signClaims({ scope: "parent", iss: ISSUER, aud: AUDIENCE, iat: now + 60, exp: now + 3600 });
    await expect(verifyParentSession(token, NOW)).resolves.toBeNull();
  });

  it("rejects a token whose expiry does not follow its issued-at time", async () => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signClaims({ scope: "parent", iss: ISSUER, aud: AUDIENCE, iat: now, exp: now });
    await expect(verifyParentSession(token, NOW)).resolves.toBeNull();
  });

  it.each([
    ["issuer", { iss: "other", aud: AUDIENCE }],
    ["audience", { iss: ISSUER, aud: "other" }],
  ])("rejects a token with the wrong %s", async (_claim, identity) => {
    const now = Math.floor(NOW.getTime() / 1000);
    const token = await signClaims({ scope: "parent", ...identity, iat: now, exp: now + 3600 });
    await expect(verifyParentSession(token, NOW)).resolves.toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await createParentSession({ now: NOW, durationHours: 1 });
    await expect(verifyParentSession(token, new Date(NOW.getTime() + 3601_000))).resolves.toBeNull();
  });

  it("fails closed when the secret is too short", async () => {
    process.env.PARENT_SESSION_SECRET = "too-short";
    await expect(createParentSession({ now: NOW, durationHours: 1 })).rejects.toThrow(
      "PARENT_SESSION_SECRET",
    );
  });

  it.each([0, 169])("rejects an unsafe %s-hour session duration", async (durationHours) => {
    await expect(createParentSession({ now: NOW, durationHours })).rejects.toThrow("duration");
  });

  it("uses hardened cookie settings with an explicit lifetime", () => {
    expect(parentSessionCookieOptions(2, false)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 7200,
    });
  });
});
