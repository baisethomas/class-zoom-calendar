import "server-only";

import bcrypt from "bcryptjs";

type Settings = { access_code_hash: string | null; parent_session_hours: number };
export type AccessResult = { ok: true } | { ok: false; error: string };

type ParentAccessDependencies = {
  fingerprint(): string;
  consumeAttempt(fingerprint: string, limit: number, windowSeconds: number): Promise<boolean>;
  loadSettings(): Promise<Settings | null>;
  compareCode(code: string, hash: string): Promise<boolean>;
  createSession(durationHours: number): Promise<string>;
  setSessionCookie(token: string, durationHours: number): Promise<void>;
};

const INVALID_CODE: AccessResult = { ok: false, error: "Invalid access code" };

export async function processParentAccess(
  formData: FormData,
  dependencies: ParentAccessDependencies,
): Promise<AccessResult> {
  const rawCode = formData.get("accessCode");
  if (typeof rawCode !== "string") return INVALID_CODE;
  const code = rawCode.trim();
  if (!code || code.length > 256) return INVALID_CODE;

  const fingerprint = dependencies.fingerprint();
  const allowed = await dependencies.consumeAttempt(fingerprint, 5, 900);
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }
  if (bcrypt.truncates(code)) return INVALID_CODE;

  const settings = await dependencies.loadSettings();
  if (!settings?.access_code_hash) return INVALID_CODE;

  const valid = await dependencies.compareCode(code, settings.access_code_hash);
  if (!valid) return INVALID_CODE;

  const token = await dependencies.createSession(settings.parent_session_hours);
  await dependencies.setSessionCookie(token, settings.parent_session_hours);
  return { ok: true };
}
