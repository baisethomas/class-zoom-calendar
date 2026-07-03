import { headers } from "next/headers";

import {
  addAdmin,
  regenerateCalendarFeedToken,
  removeAdmin,
  rotateParentAccessCode,
  updateSchoolSettings,
} from "@/features/settings/admin-actions";
import { AdminsList, type AdminEntry } from "@/features/settings/admins-list";
import {
  AccessCodeForm,
  CalendarFeedForm,
  SchoolSettingsForm,
} from "@/features/settings/settings-forms";
import { bootstrapAdminId, requireAdmin } from "@/features/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SchoolSettings = {
  display_name: string;
  timezone: string;
  access_code_hash: string | null;
  parent_session_hours: number;
  calendar_feed_token: string | null;
  updated_at: string | null;
};

const SETTINGS_FIELDS =
  "display_name,timezone,access_code_hash,parent_session_hours,calendar_feed_token,updated_at" as const;

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
    calendar_feed_token: data.calendar_feed_token,
    updated_at: data.updated_at,
  };
}

async function getAdminAccess(): Promise<{ currentUserId: string; admins: AdminEntry[] }> {
  const user = await requireAdmin();
  const client = createAdminClient();
  const { data, error } = await client
    .from("admins")
    .select("user_id,label")
    .order("created_at", { ascending: true });
  if (error || !data) throw new Error("Unable to load settings");
  return { currentUserId: user.id, admins: data };
}

async function calendarFeedUrl(token: string | null): Promise<string | null> {
  if (!token) return null;
  const headerStore = await headers();
  const host = headerStore.get("host");
  if (!host) return null;
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}/api/calendar-feed?token=${token}`;
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
  const { currentUserId, admins } = await getAdminAccess();
  const updatedAt = formattedUpdatedAt(settings.updated_at);
  const feedUrl = await calendarFeedUrl(settings.calendar_feed_token);

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
          <div className="settings-section__header">
            <h2 id="school-settings-title">School details</h2>
            <p className="settings-section__copy">Set the school name, timezone, and how long parent sessions stay active.</p>
          </div>
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
          <div className="settings-section__header">
            <h2 id="access-code-title">Parent access</h2>
            <p className="settings-section__copy">Rotate the shared family code without exposing any existing value.</p>
          </div>
          <AccessCodeForm
            action={rotateParentAccessCode}
            hasAccessCode={Boolean(settings.access_code_hash)}
          />
        </section>

        <section aria-labelledby="calendar-feed-title">
          <div className="settings-section__header">
            <h2 id="calendar-feed-title">Calendar feed</h2>
            <p className="settings-section__copy">Generate a private subscription link parents can add to their own calendar apps.</p>
          </div>
          <CalendarFeedForm action={regenerateCalendarFeedToken} feedUrl={feedUrl} />
        </section>

        <section aria-labelledby="admins-title">
          <div className="settings-section__header">
            <h2 id="admins-title">Administrators</h2>
            <p className="settings-section__copy">Manage who can sign in and edit the calendar for your school.</p>
          </div>
          <AdminsList
            admins={admins}
            bootstrapAdminId={bootstrapAdminId()}
            currentUserId={currentUserId}
            addAction={addAdmin}
            removeAction={removeAdmin}
          />
        </section>
      </div>
    </section>
  );
}
