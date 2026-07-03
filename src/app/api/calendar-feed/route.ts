import { type NextRequest } from "next/server";

import { buildCalendarIcs } from "@/features/calendar-feed/ics";
import { feedTokensMatch, isWellFormedFeedToken } from "@/features/calendar-feed/token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CLASS_FIELDS =
  "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status" as const;
const PAST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!isWellFormedFeedToken(token)) return notFound();

  const client = createAdminClient();
  const { data: settings, error: settingsError } = await client
    .from("school_settings")
    .select("display_name,calendar_feed_token")
    .eq("id", true)
    .single();
  if (settingsError || !settings?.calendar_feed_token) return notFound();
  if (!feedTokensMatch(token, settings.calendar_feed_token)) return notFound();

  const now = Date.now();
  const { data: classes, error: classesError } = await client
    .from("classes")
    .select(CLASS_FIELDS)
    .gte("starts_at", new Date(now - PAST_WINDOW_MS).toISOString())
    .lt("starts_at", new Date(now + FUTURE_WINDOW_MS).toISOString())
    .order("starts_at", { ascending: true });
  if (classesError || !classes) {
    return new Response(null, { status: 500 });
  }

  const ics = buildCalendarIcs({
    classes,
    calendarName: settings.display_name,
    host: request.nextUrl.hostname,
    generatedAt: new Date(now).toISOString(),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
