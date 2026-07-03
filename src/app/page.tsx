import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  const session = await verifyParentSession(token);
  redirect(session ? "/calendar" : "/access");
}
