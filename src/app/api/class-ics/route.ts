import { cookies } from "next/headers";
import { type NextRequest } from "next/server";

import { buildCalendarIcs } from "@/features/calendar-feed/ics";
import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CLASS_FIELDS =
  "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  if (!(await verifyParentSession(token))) {
    return new Response(null, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_PATTERN.test(id)) return new Response(null, { status: 404 });

  const client = createAdminClient();
  const [{ data: classItem, error: classError }, { data: settings, error: settingsError }] =
    await Promise.all([
      client.from("classes").select(CLASS_FIELDS).eq("id", id).maybeSingle(),
      client.from("school_settings").select("display_name").eq("id", true).single(),
    ]);
  if (classError || settingsError || !settings) {
    return new Response(null, { status: 500 });
  }
  if (!classItem) return new Response(null, { status: 404 });

  const ics = buildCalendarIcs({
    classes: [classItem],
    calendarName: settings.display_name,
    host: request.nextUrl.hostname,
    generatedAt: new Date().toISOString(),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="class-${id}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
