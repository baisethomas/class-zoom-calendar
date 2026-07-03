import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function generateFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedFeedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function feedTokensMatch(candidate: string, stored: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const storedBytes = Buffer.from(stored, "utf8");
  if (candidateBytes.length !== storedBytes.length) return false;
  return timingSafeEqual(candidateBytes, storedBytes);
}
