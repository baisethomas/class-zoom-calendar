import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/features/admin/auth";
import { updateClass, type ClassFormValues } from "@/features/classes/admin-actions";
import { ClassForm } from "@/features/classes/class-form";
import { instantToLocalDateTimeFields } from "@/features/classes/time";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLASS_FIELDS =
  "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status,series_id" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getEditableClass(
  id: string,
): Promise<{ values: ClassFormValues; inSeries: boolean }> {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) notFound();

  const client = createAdminClient();
  const [{ data: classItem, error: classError }, { data: settings, error: settingsError }] =
    await Promise.all([
      client.from("classes").select(CLASS_FIELDS).eq("id", id).maybeSingle(),
      client.from("school_settings").select("timezone").eq("id", true).single(),
    ]);

  if (classError || settingsError || !settings?.timezone) throw new Error("Unable to load class");
  if (!classItem) notFound();

  const startsAt = instantToLocalDateTimeFields(classItem.starts_at, settings.timezone);
  const endsAt = instantToLocalDateTimeFields(classItem.ends_at, settings.timezone);

  return {
    values: {
      title: classItem.title,
      description: classItem.description ?? "",
      teacherName: classItem.teacher_name,
      date: startsAt.date,
      startTime: startsAt.time,
      endTime: endsAt.time,
      zoomUrl: classItem.zoom_url,
      repeat: "none",
      repeatUntil: "",
    },
    inSeries: classItem.series_id !== null,
  };
}

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { values: initialValues, inSeries } = await getEditableClass(id);
  const action = updateClass.bind(null, id);

  return (
    <section className="admin-page admin-page--narrow">
      <p className="eyebrow">Administrator</p>
      <h1>Edit class</h1>
      <p className="intro">
        {inSeries
          ? "This class is part of a weekly series. Changes can apply to just this class or to this and all future classes."
          : "Update the class details without changing its scheduled/canceled status."}
      </p>
      <ClassForm
        action={action}
        initialValues={initialValues}
        submitLabel="Save class"
        showSeriesScope={inSeries}
      />
      <p className="back-link">
        <Link href="/admin/classes">Back to classes</Link>
      </p>
    </section>
  );
}
