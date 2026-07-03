import "server-only";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReminderSubscribeState =
  | { ok: true }
  | { ok: false; error: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).refine(
  (value) => value.length <= 320,
  "Email must contain no more than 320 characters",
);

const INVALID_EMAIL: ReminderSubscribeState = {
  ok: false,
  error: "Enter a valid email address.",
};
const SAVE_ERROR: ReminderSubscribeState = {
  ok: false,
  error: "Unable to subscribe right now. Please try again.",
};

export async function subscribeToReminders(
  _previousState: ReminderSubscribeState | undefined,
  formData: FormData,
): Promise<ReminderSubscribeState> {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  if (!(await verifyParentSession(token))) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const rawEmail = formData.get("email");
  if (typeof rawEmail !== "string") return INVALID_EMAIL;
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return INVALID_EMAIL;

  const client = createAdminClient();
  const { error } = await client.from("reminder_subscriptions").upsert(
    {
      email: parsed.data,
      unsubscribe_token: randomBytes(32).toString("base64url"),
    },
    { onConflict: "email", ignoreDuplicates: true },
  );
  if (error) return SAVE_ERROR;

  return { ok: true };
}
