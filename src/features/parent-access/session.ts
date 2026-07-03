import "server-only";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const PARENT_SESSION_COOKIE = "parent_session";
const PARENT_SESSION_ISSUER = "class-calendar";
const PARENT_SESSION_AUDIENCE = "parent-calendar";
const MAX_SESSION_HOURS = 168;

export type ParentSessionClaims = JWTPayload & { scope: "parent" };

function sessionSecret() {
  const value = process.env.PARENT_SESSION_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("PARENT_SESSION_SECRET must be at least 32 bytes");
  }
  return Uint8Array.from(Buffer.from(value, "utf8"));
}

export async function createParentSession({
  now,
  durationHours,
}: {
  now: Date;
  durationHours: number;
}) {
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > MAX_SESSION_HOURS) {
    throw new Error("Parent session duration must be between 1 and 168 hours");
  }
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + durationHours * 60 * 60;
  return new SignJWT({ scope: "parent" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(PARENT_SESSION_ISSUER)
    .setAudience(PARENT_SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(sessionSecret());
}

export async function verifyParentSession(
  token: string | undefined,
  now = new Date(),
): Promise<ParentSessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: PARENT_SESSION_ISSUER,
      audience: PARENT_SESSION_AUDIENCE,
      requiredClaims: ["iat", "exp"],
      currentDate: now,
    });
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      payload.scope !== "parent" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > nowSeconds ||
      payload.exp <= payload.iat
    ) return null;
    return payload as ParentSessionClaims;
  } catch {
    return null;
  }
}

export function parentSessionCookieOptions(durationHours: number, secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: durationHours * 60 * 60,
  };
}
