"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  PARENT_SESSION_COOKIE,
  createParentSession,
  parentSessionCookieOptions,
} from "@/features/parent-access/session";
import { processParentAccess, type AccessResult } from "@/features/parent-access/service";
import { createRequestFingerprint } from "@/lib/security/request-fingerprint";

export async function requestParentAccess(
  _previousState: AccessResult | undefined,
  formData: FormData,
): Promise<AccessResult> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const result = await processParentAccess(formData, {
    fingerprint: () => createRequestFingerprint(requestHeaders),
    consumeAttempt: async (fingerprint, limit, windowSeconds) => {
      const { data, error } = await supabase.rpc("consume_parent_access_attempt", {
        p_client_key: fingerprint,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error("Unable to validate access at this time");
      return data;
    },
    loadSettings: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("access_code_hash,parent_session_hours")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error("Unable to validate access at this time");
      return data;
    },
    compareCode: bcrypt.compare,
    createSession: (durationHours) => createParentSession({ now: new Date(), durationHours }),
    setSessionCookie: async (token, durationHours) => {
      cookieStore.set(PARENT_SESSION_COOKIE, token, parentSessionCookieOptions(durationHours));
    },
  });

  if (result.ok) redirect("/calendar");
  return result;
}
