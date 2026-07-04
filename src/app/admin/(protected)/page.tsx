import Link from "next/link";

import { requireAdmin } from "@/features/admin/auth";
import { formatClassTime, getDateKey } from "@/features/classes/time";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIST_FIELDS = "id,title,teacher_name,starts_at,ends_at,status" as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type UpcomingClass = {
  id: string;
  title: string;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Dashboard = {
  schoolName: string;
  timeZone: string;
  upcomingCount: number;
  weekCount: number;
  canceledCount: number;
  nextUp: UpcomingClass[];
};

async function getDashboard(): Promise<Dashboard> {
  await requireAdmin();
  const client = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const weekIso = new Date(now.getTime() + WEEK_MS).toISOString();

  const [settingsRes, nextUpRes, upcomingCountRes, weekCountRes, canceledCountRes] =
    await Promise.all([
      client.from("school_settings").select("display_name,timezone").eq("id", true).single(),
      client
        .from("classes")
        .select(LIST_FIELDS)
        .gte("starts_at", nowIso)
        .eq("status", "scheduled")
        .order("starts_at", { ascending: true })
        .limit(5),
      client
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", nowIso)
        .eq("status", "scheduled"),
      client
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", nowIso)
        .lt("starts_at", weekIso)
        .eq("status", "scheduled"),
      client
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", nowIso)
        .eq("status", "canceled"),
    ]);

  if (settingsRes.error || !settingsRes.data?.timezone) throw new Error("Unable to load dashboard");

  return {
    schoolName: settingsRes.data.display_name,
    timeZone: settingsRes.data.timezone,
    upcomingCount: upcomingCountRes.count ?? 0,
    weekCount: weekCountRes.count ?? 0,
    canceledCount: canceledCountRes.count ?? 0,
    nextUp: nextUpRes.data ?? [],
  };
}

function dayLabel(startsAt: string, timeZone: string): string {
  const [year, month, day] = getDateKey(startsAt, timeZone).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export default async function AdminPage() {
  const dashboard = await getDashboard();
  const nextClass = dashboard.nextUp[0] ?? null;

  return (
    <section className="admin-page admin-dashboard">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Dashboard</h1>
          <p className="intro">{dashboard.schoolName} · times shown in {dashboard.timeZone}.</p>
        </div>
        <div className="admin-page__header-actions">
          <Link className="secondary-action" href="/admin/classes/import">Import CSV</Link>
          <Link className="primary-action" href="/admin/classes/new">New class</Link>
        </div>
      </div>

      <div className="admin-stat-grid" aria-label="Schedule overview">
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Upcoming classes</p>
          <p className="admin-stat-card__value">{dashboard.upcomingCount}</p>
          <p className="admin-stat-card__meta">scheduled from today</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Next 7 days</p>
          <p className="admin-stat-card__value">{dashboard.weekCount}</p>
          <p className="admin-stat-card__meta">classes this week</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Next class</p>
          <p className="admin-stat-card__value admin-stat-card__value--text">
            {nextClass ? nextClass.title : "None scheduled"}
          </p>
          <p className="admin-stat-card__meta">
            {nextClass
              ? `${dayLabel(nextClass.starts_at, dashboard.timeZone)}, ${formatClassTime(nextClass.starts_at, nextClass.ends_at, dashboard.timeZone)}`
              : "Add a class to get started"}
          </p>
        </article>
        <article className={`admin-stat-card${dashboard.canceledCount > 0 ? " admin-stat-card--warn" : ""}`}>
          <p className="admin-stat-card__label">Canceled ahead</p>
          <p className="admin-stat-card__value">{dashboard.canceledCount}</p>
          <p className="admin-stat-card__meta">upcoming, still visible to parents</p>
        </article>
      </div>

      <div className="admin-dashboard__columns">
        <section className="admin-panel" aria-labelledby="next-up-title">
          <div className="admin-panel__header">
            <h2 id="next-up-title">Next up</h2>
            <Link className="text-link" href="/admin/classes">Manage classes</Link>
          </div>
          {dashboard.nextUp.length === 0 ? (
            <p className="empty-state">No upcoming classes. Create one to get started.</p>
          ) : (
            <ul className="admin-next-list">
              {dashboard.nextUp.map((item) => (
                <li className="admin-next-row" key={item.id}>
                  <div>
                    <p className="admin-next-row__title">{item.title}</p>
                    <p className="admin-next-row__meta">{item.teacher_name}</p>
                  </div>
                  <p className="admin-next-row__time">
                    <span>{dayLabel(item.starts_at, dashboard.timeZone)}</span>
                    <time dateTime={item.starts_at}>
                      {formatClassTime(item.starts_at, item.ends_at, dashboard.timeZone)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-panel admin-panel--links" aria-labelledby="tools-title">
          <div className="admin-panel__header">
            <h2 id="tools-title">Tools</h2>
          </div>
          <Link className="admin-tool" href="/admin/classes">
            <span className="admin-tool__title">Classes</span>
            <span className="admin-tool__body">Create, edit, import, cancel, or duplicate classes.</span>
          </Link>
          <Link className="admin-tool" href="/admin/settings">
            <span className="admin-tool__title">Settings</span>
            <span className="admin-tool__body">School name, access code, calendar feed, and administrators.</span>
          </Link>
        </section>
      </div>
    </section>
  );
}
