import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/lib/supabase/database.types";

function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, publishableKey };
}

export async function proxy(request: NextRequest) {
  const { url, publishableKey } = publicSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headersToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headersToSet ?? {})) {
          response.headers.set(name, value);
        }
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Protected admin layouts still authorize with getUser. The proxy exists to
    // persist refreshed cookies; provider/network failures must not leak details
    // or turn every admin request into a middleware-level 500.
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
