import { type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function htmlResponse(message: string, status: number): Response {
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Class reminders</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;">
    <h1 style="font-size: 1.4rem;">Class reminders</h1>
    <p>${message}</p>
  </body>
</html>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_PATTERN.test(token)) {
    return htmlResponse("That unsubscribe link is not valid.", 400);
  }

  const client = createAdminClient();
  const { error } = await client
    .from("reminder_subscriptions")
    .delete()
    .eq("unsubscribe_token", token);
  if (error) {
    return htmlResponse("Something went wrong. Please try the link again later.", 500);
  }

  return htmlResponse("You are unsubscribed from class reminder emails.", 200);
}
