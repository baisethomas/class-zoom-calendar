import "server-only";

import { buildDigestEmail, digestDateKey, type DigestClass } from "@/features/reminders/digest";
import { sendEmail, type EmailMessage, type EmailSendResult } from "@/features/reminders/email";
import { createAdminClient } from "@/lib/supabase/admin";

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReminderRunResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; subscribers: number; classes: number; failures: number };

type ReminderSendDependencies = {
  client?: ReturnType<typeof createAdminClient>;
  deliver?: (message: EmailMessage) => Promise<EmailSendResult>;
};

/**
 * Sends the daily reminder digest covering classes that start within the next
 * 24 hours. Idempotent per school-local calendar date: reruns on the same day
 * are no-ops.
 */
export async function sendReminderDigest(
  { now, origin }: { now: Date; origin: string },
  dependencies: ReminderSendDependencies = {},
): Promise<ReminderRunResult> {
  const client = dependencies.client ?? createAdminClient();
  const deliver = dependencies.deliver ?? sendEmail;

  const { data: settings, error: settingsError } = await client
    .from("school_settings")
    .select("display_name,timezone")
    .eq("id", true)
    .single();
  if (settingsError || !settings) return { status: "skipped", reason: "settings unavailable" };

  const { data: subscribers, error: subscribersError } = await client
    .from("reminder_subscriptions")
    .select("email,unsubscribe_token");
  if (subscribersError || !subscribers) {
    return { status: "skipped", reason: "subscriptions unavailable" };
  }
  if (subscribers.length === 0) return { status: "skipped", reason: "no subscribers" };

  const { data: classes, error: classesError } = await client
    .from("classes")
    .select("title,teacher_name,starts_at,ends_at,zoom_url,status")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + DIGEST_WINDOW_MS).toISOString())
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });
  if (classesError || !classes) return { status: "skipped", reason: "classes unavailable" };
  if (classes.length === 0) return { status: "skipped", reason: "no upcoming classes" };

  // Claim today's digest before sending so concurrent runs cannot double-send.
  const { data: claimed, error: claimError } = await client
    .from("reminder_digests")
    .upsert({ digest_date: digestDateKey(now, settings.timezone) }, { ignoreDuplicates: true })
    .select("digest_date");
  if (claimError) return { status: "skipped", reason: "digest claim failed" };
  if (!claimed || claimed.length === 0) return { status: "skipped", reason: "already sent today" };

  let failures = 0;
  for (const subscriber of subscribers) {
    const { subject, text } = buildDigestEmail({
      classes: classes as DigestClass[],
      schoolName: settings.display_name,
      timeZone: settings.timezone,
      calendarUrl: `${origin}/calendar`,
      unsubscribeUrl: `${origin}/api/reminder-unsubscribe?token=${subscriber.unsubscribe_token}`,
    });
    const result = await deliver({ to: subscriber.email, subject, text });
    if (!result.sent) failures += 1;
  }

  return {
    status: "sent",
    subscribers: subscribers.length,
    classes: classes.length,
    failures,
  };
}
