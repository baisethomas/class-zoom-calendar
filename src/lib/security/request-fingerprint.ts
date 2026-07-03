import { createHmac } from "node:crypto";

function fingerprintSecret() {
  const value = process.env.REQUEST_FINGERPRINT_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("REQUEST_FINGERPRINT_SECRET must be at least 32 bytes");
  }
  return value;
}

function firstForwardedAddress(value: string | null) {
  return value?.split(",", 1)[0]?.trim().toLowerCase() || null;
}

export function createRequestFingerprint(headers: Headers) {
  const address =
    firstForwardedAddress(headers.get("x-vercel-forwarded-for")) ??
    firstForwardedAddress(headers.get("x-forwarded-for")) ??
    firstForwardedAddress(headers.get("x-real-ip"));

  const source = address
    ? `address:${address}`
    : `fallback:${headers.get("user-agent") ?? "unknown"}|${headers.get("accept-language") ?? "unknown"}`;

  return createHmac("sha256", fingerprintSecret()).update(source).digest("hex");
}
