import "server-only";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { clearSupabaseAuthCookies, createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminActionState = { ok: false; error: string };

const LOGIN_ERROR: AdminActionState = { ok: false, error: "Invalid email or password" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function configuredAdminId() {
  const value = process.env.ADMIN_USER_ID;
  return value && UUID_PATTERN.test(value) ? value : null;
}

export function bootstrapAdminId(): string | null {
  return configuredAdminId();
}

async function isAdditionalAdmin(userId: string): Promise<boolean> {
  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

async function isAuthorizedAdminUser(userId: string, adminId: string): Promise<boolean> {
  if (userId === adminId) return true;
  return isAdditionalAdmin(userId);
}

export async function requireAdmin() {
  const adminId = configuredAdminId();
  if (!adminId) redirect("/admin/login");

  let authResult;
  try {
    const supabase = await createServerSupabaseClient();
    authResult = await supabase.auth.getUser();
  } catch {
    redirect("/admin/login");
  }

  const { data, error } = authResult;
  if (error || !data.user) redirect("/admin/login");
  if (!(await isAuthorizedAdminUser(data.user.id, adminId))) redirect("/admin/login");
  return data.user;
}

export async function loginAdmin(
  _previousState: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  "use server";

  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length === 0 ||
    email.length > 320 ||
    password.length === 0 ||
    password.length > 1024
  ) {
    return LOGIN_ERROR;
  }

  const supabase = await createServerSupabaseClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) return LOGIN_ERROR;

  const adminId = configuredAdminId();
  const { data, error: userError } = await supabase.auth.getUser();
  const authorized =
    adminId && !userError && data.user
      ? await isAuthorizedAdminUser(data.user.id, adminId)
      : false;
  if (!authorized) {
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) await clearSupabaseAuthCookies();
    } catch {
      await clearSupabaseAuthCookies();
    }
    return LOGIN_ERROR;
  }

  redirect("/admin");
}

export async function logoutAdmin(): Promise<AdminActionState> {
  "use server";

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: "Unable to sign out. Please try again." };
  redirect("/admin/login");
}
