import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRequestFingerprint } from "@/lib/security/request-fingerprint";

describe("request fingerprint", () => {
  beforeEach(() => {
    process.env.REQUEST_FINGERPRINT_SECRET = "a-request-fingerprint-secret-at-least-32-bytes";
  });

  afterEach(() => {
    delete process.env.REQUEST_FINGERPRINT_SECRET;
  });

  it("is deterministic and never exposes the normalized client address", () => {
    const headers = new Headers({
      "x-forwarded-for": " 203.0.113.42, 10.0.0.1 ",
    });

    const first = createRequestFingerprint(headers);
    const second = createRequestFingerprint(headers);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.42");
  });

  it("prefers Vercel's trusted address header", () => {
    const vercel = createRequestFingerprint(
      new Headers({ "x-vercel-forwarded-for": "198.51.100.8", "x-forwarded-for": "203.0.113.9" }),
    );
    const standard = createRequestFingerprint(new Headers({ "x-forwarded-for": "198.51.100.8" }));
    expect(vercel).toBe(standard);
  });

  it("uses request metadata in the fallback to avoid collapsing all unknown clients", () => {
    const first = createRequestFingerprint(new Headers({ "user-agent": "browser-a" }));
    const second = createRequestFingerprint(new Headers({ "user-agent": "browser-b" }));
    expect(first).not.toBe(second);
  });

  it("fails closed for an invalid secret", () => {
    process.env.REQUEST_FINGERPRINT_SECRET = "short";
    expect(() => createRequestFingerprint(new Headers())).toThrow("REQUEST_FINGERPRINT_SECRET");
  });
});
