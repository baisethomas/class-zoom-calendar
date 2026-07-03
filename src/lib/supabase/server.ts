import "server-only";

import { createServerClient } from "@supabase/ssr";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";

function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, publishableKey };
}

function isServerComponentCookieWrite(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Cookies can only be modified in a Server Action or Route Handler")
  );
}

export async function createServerSupabaseClient() {
  const { url, publishableKey } = publicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet, headersToSet) => {
        try {
          if (Object.keys(headersToSet ?? {}).length > 0) noStore();
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          if (!isServerComponentCookieWrite(error)) throw error;
        }
      },
    },
  });
}

const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

export async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (!SUPABASE_AUTH_COOKIE_PATTERN.test(cookie.name)) continue;
    cookieStore.set(cookie.name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}
