import { cookies } from "next/headers";

import { PARENT_SESSION_COOKIE } from "@/features/parent-access/session";

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: PARENT_SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return new Response(null, { status: 204 });
}
