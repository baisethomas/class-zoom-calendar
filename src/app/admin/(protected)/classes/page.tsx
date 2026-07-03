import Link from "next/link";

import {
  deleteClass,
  setClassStatus,
} from "@/features/classes/admin-actions";
import { AdminClassList, type AdminClass } from "@/features/classes/admin-class-list";
import { requireAdmin } from "@/features/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLASS_FIELDS = "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status" as const;

async function getAdminClasses(): Promise<{ classes: AdminClass[]; timeZone: string }> {
  await requireAdmin();
  const client = createAdminClient();
  const recentCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: classes, error: classesError }, { data: settings, error: settingsError }] =
    await Promise.all([
      client
        .from("classes")
        .select(CLASS_FIELDS)
        .gte("starts_at", recentCutoff)
        .order("starts_at", { ascending: true }),
      client.from("school_settings").select("timezone").eq("id", true).single(),
    ]);

  if (classesError || !classes || settingsError || !settings?.timezone) {
    throw new Error("Unable to load classes");
  }

  return { classes, timeZone: settings.timezone };
}

export default async function ClassesPage() {
  const { classes, timeZone } = await getAdminClasses();

  return (
    <section className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Classes</h1>
          <p className="intro">Create, edit, cancel, restore, or remove Zoom classes.</p>
        </div>
        <Link className="primary-action" href="/admin/classes/new">
          New class
        </Link>
      </div>
      <AdminClassList
        classes={classes}
        timeZone={timeZone}
        setStatusAction={setClassStatus}
        deleteAction={deleteClass}
      />
    </section>
  );
}
