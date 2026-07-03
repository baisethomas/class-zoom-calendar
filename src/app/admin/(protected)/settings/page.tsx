import {
  rotateParentAccessCode,
  updateSchoolSettings,
} from "@/features/settings/admin-actions";
import {
  AccessCodeForm,
  SchoolSettingsForm,
} from "@/features/settings/settings-forms";
import { requireAdmin } from "@/features/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SchoolSettings = {
  display_name: string;
  timezone: string;
  access_code_hash: string | null;
  parent_session_hours: number;
  updated_at: string | null;
};

const SETTINGS_FIELDS = "display_name,timezone,access_code_hash,parent_session_hours,updated_at" as const;

async function getSchoolSettings(): Promise<SchoolSettings> {
  await requireAdmin();
  const client = createAdminClient();
  const { data, error } = await client
    .from("school_settings")
    .select(SETTINGS_FIELDS)
    .eq("id", true)
    .single();

  if (
    error ||
    !data ||
    typeof data.display_name !== "string" ||
    typeof data.timezone !== "string" ||
    typeof data.parent_session_hours !== "number"
  ) {
    throw new Error("Unable to load settings");
  }

  return {
    display_name: data.display_name,
    timezone: data.timezone,
    access_code_hash: data.access_code_hash,
    parent_session_hours: data.parent_session_hours,
    updated_at: data.updated_at,
  };
}

function formattedUpdatedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default async function SettingsPage() {
  const settings = await getSchoolSettings();
  const updatedAt = formattedUpdatedAt(settings.updated_at);

  return (
    <section className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Settings</h1>
          <p className="intro">Manage your school name, calendar timezone, parent sessions, and shared access code.</p>
          {updatedAt ? <p className="intro">Updated {updatedAt}</p> : null}
        </div>
      </div>

      <div className="admin-settings">
        <section aria-labelledby="school-settings-title">
          <h2 id="school-settings-title">School details</h2>
          <SchoolSettingsForm
            action={updateSchoolSettings}
            initialValues={{
              displayName: settings.display_name,
              timezone: settings.timezone,
              parentSessionHours: String(settings.parent_session_hours),
            }}
          />
        </section>

        <section aria-labelledby="access-code-title">
          <h2 id="access-code-title">Parent access</h2>
          <AccessCodeForm
            action={rotateParentAccessCode}
            hasAccessCode={Boolean(settings.access_code_hash)}
          />
        </section>
      </div>
    </section>
  );
}
