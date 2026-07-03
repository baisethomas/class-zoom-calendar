import { type NextRequest } from "next/server";

import { emailDeliveryConfigured } from "@/features/reminders/email";
import { sendReminderDigest } from "@/features/reminders/send";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  if (!emailDeliveryConfigured()) {
    return Response.json({ status: "skipped", reason: "email delivery not configured" });
  }

  const result = await sendReminderDigest({
    now: new Date(),
    origin: request.nextUrl.origin,
  });

  return Response.json(result);
}
