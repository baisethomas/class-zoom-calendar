import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Agenda } from "@/features/classes/agenda";
import { MonthPicker } from "@/features/classes/month-picker";
import {
  getNextParentClass,
  getParentClasses,
  type ParentClass,
} from "@/features/classes/queries";
import { formatClassTime, getDateKey } from "@/features/classes/time";
import { LogoutButton } from "@/features/parent-access/logout-button";
import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";
import { subscribeToReminders } from "@/features/reminders/actions";
import { ReminderSubscribeForm } from "@/features/reminders/subscribe-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CalendarView = "agenda" | "month";
type SearchParams = Record<string, string | string[] | undefined>;

function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year! < 2000 || year! > 2100) return false;
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function monthEnvelope(dateKey: string): { from: string; to: string } {
  const [year, month] = dateKey.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year!, month! - 1, 0)).toISOString(),
    to: new Date(Date.UTC(year!, month!, 2)).toISOString(),
  };
}

function classesInMonth(classes: ParentClass[], date: string, timeZone: string): ParentClass[] {
  const month = date.slice(0, 7);
  return classes.filter((item) => getDateKey(item.starts_at, timeZone).startsWith(month));
}

function classesOnDate(classes: ParentClass[], dateKey: string, timeZone: string): ParentClass[] {
  return classes.filter((item) => getDateKey(item.starts_at, timeZone) === dateKey);
}

function calendarHref(date: string, view: CalendarView): string {
  return `/calendar?date=${date}&view=${view}`;
}

function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function greetingForHour(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function schoolInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  if (!token) redirect("/access");
  if (!(await verifyParentSession(token))) redirect("/access");

  const params = (await searchParams) ?? {};
  const requestedDate = params.date;
  const requestedView = params.view;
  if (
    (requestedDate !== undefined && !validDateKey(requestedDate)) ||
    (requestedView !== undefined && requestedView !== "agenda" && requestedView !== "month")
  ) redirect("/calendar");

  const now = new Date();
  const provisionalDate = requestedDate ?? getDateKey(now, "UTC");
  const view: CalendarView = requestedView ?? "agenda";
  const [initialResult, nextClass] = await Promise.all([
    getParentClasses({
      ...monthEnvelope(provisionalDate),
      sessionToken: token,
    }),
    getNextParentClass({ from: now.toISOString(), sessionToken: token }),
  ]);
  let result = initialResult;
  const todayDate = getDateKey(now, result.school.timezone);
  const selectedDate = requestedDate ?? todayDate;

  if (!requestedDate && selectedDate.slice(0, 7) !== provisionalDate.slice(0, 7)) {
    result = await getParentClasses({ ...monthEnvelope(selectedDate), sessionToken: token });
  }

  const monthClasses = classesInMonth(result.classes, selectedDate, result.school.timezone);
  const classDateKeys = new Set(
    monthClasses.map((item) => getDateKey(item.starts_at, result.school.timezone)),
  );
  const classTitlesByDate = new Map<string, string[]>();
  for (const item of monthClasses) {
    const key = getDateKey(item.starts_at, result.school.timezone);
    classTitlesByDate.set(key, [...(classTitlesByDate.get(key) ?? []), item.title]);
  }
  const selectedDayClasses = monthClasses.filter(
    (item) => getDateKey(item.starts_at, result.school.timezone) === selectedDate,
  );
  const todayClasses = classesOnDate(monthClasses, todayDate, result.school.timezone);
  const scheduleClasses = view === "agenda" ? monthClasses : selectedDayClasses;
  const scheduleTitle =
    view === "agenda"
      ? todayDate === selectedDate
        ? "Today’s schedule"
        : `${formatDateHeading(selectedDate)} schedule`
      : `${formatDateHeading(selectedDate)} classes`;
  const scheduleCopy =
    view === "agenda"
      ? `${countLabel(monthClasses.length, "class", "classes")} on the calendar this month.`
      : `${countLabel(selectedDayClasses.length, "class", "classes")} on the selected day.`;
  const nextClassCopy = nextClass && typeof nextClass.starts_at === "string" && typeof nextClass.ends_at === "string"
    ? formatClassTime(nextClass.starts_at, nextClass.ends_at, result.school.timezone)
    : "No upcoming classes yet";
  const schoolLabel = `${greetingForHour(now, result.school.timezone)}.`;

  return (
    <div className="calendar-page">
      <div className="calendar-dashboard">
        <aside className="calendar-rail calendar-rail--left">
          <div className="calendar-brand">
            <span className="calendar-brand__mark" aria-hidden="true" />
            <div>
              <p className="calendar-brand__title">{result.school.display_name}</p>
              <p className="calendar-brand__subtitle">Class Calendar</p>
            </div>
          </div>

          <nav className="calendar-nav" aria-label="Calendar views">
            <a
              href={calendarHref(selectedDate, "agenda")}
              aria-current={view === "agenda" ? "page" : undefined}
            >
              Agenda view
            </a>
            <a
              href={calendarHref(selectedDate, "month")}
              aria-current={view === "month" ? "page" : undefined}
            >
              Month view
            </a>
            <a href={calendarHref(todayDate, view)}>Today</a>
          </nav>

          <section className="calendar-rail-card calendar-rail-card--support" aria-labelledby="calendar-help-title">
            <h2 id="calendar-help-title">Need a quick join link?</h2>
            <p>Use agenda view before class time to open the fastest route into the next session.</p>
          </section>

          <div className="calendar-rail__footer">
            <LogoutButton />
          </div>
        </aside>

        <div className="calendar-layout">
          <header className="calendar-header">
            <div>
              <p className="eyebrow">Class Calendar</p>
              <h1>{schoolLabel}</h1>
              <h2 className="calendar-school-name">{result.school.display_name}</h2>
              <p className="calendar-subtitle">
                {formatDateHeading(selectedDate)} in {result.school.timezone}. {result.school.display_name}
                {" "}keeps everything in one place.
              </p>
            </div>
          </header>

          <section className="calendar-summary-grid" aria-label="Calendar summary">
            <article className="calendar-summary-card calendar-summary-card--lavender">
              <p className="calendar-summary-card__label">Today’s classes</p>
              <h2>{countLabel(todayClasses.length, "session")}</h2>
              <p>{todayClasses.length === 0 ? "No classes scheduled today." : `${countLabel(todayClasses.length, "session")} scheduled`}</p>
            </article>
            <article className="calendar-summary-card calendar-summary-card--peach">
              <p className="calendar-summary-card__label">This month</p>
              <h2>{countLabel(monthClasses.length, "class", "classes")}</h2>
              <p>{countLabel(monthClasses.length, "class", "classes")} on the calendar</p>
            </article>
            <article className="calendar-summary-card calendar-summary-card--mint">
              <p className="calendar-summary-card__label">Coming up</p>
              <h2>{nextClass?.title ?? "All clear"}</h2>
              <p>{nextClassCopy}</p>
            </article>
          </section>

          <section className="calendar-schedule-panel" aria-labelledby="calendar-schedule-title">
            <div className="calendar-schedule-panel__header">
              <div>
                <h2 id="calendar-schedule-title">{scheduleTitle}</h2>
                <p>{scheduleCopy}</p>
              </div>
            </div>
            <div className="calendar-content">
              {view === "agenda" ? (
                <Agenda
                  classes={monthClasses}
                  timeZone={result.school.timezone}
                  nextClassId={nextClass?.id ?? null}
                />
              ) : scheduleClasses.length > 0 ? (
                <Agenda
                  classes={scheduleClasses}
                  timeZone={result.school.timezone}
                  nextClassId={nextClass?.id ?? null}
                />
              ) : monthClasses.length === 0 ? (
                <p className="empty-state">No classes scheduled</p>
              ) : (
                <p className="month-summary">
                  No classes on the selected day. {monthClasses.length}{" "}
                  {monthClasses.length === 1 ? "class" : "classes"} scheduled this month.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="calendar-rail calendar-rail--right">
          <section className="calendar-profile-card" aria-labelledby="calendar-profile-title">
            <h2 id="calendar-profile-title">School profile</h2>
            <div className="calendar-profile-card__avatar" aria-hidden="true">
              {schoolInitials(result.school.display_name)}
            </div>
            <p className="calendar-profile-card__name">{result.school.display_name}</p>
            <p className="calendar-profile-card__meta">Shared access for families</p>
          </section>

          <MonthPicker
            selectedDate={selectedDate}
            todayDate={todayDate}
            view={view}
            classDateKeys={classDateKeys}
            classTitlesByDate={classTitlesByDate}
            showViewSwitcher={false}
            showTodayLink={false}
            forceMonthGrid
            compact
          />
          <ReminderSubscribeForm action={subscribeToReminders} />
        </aside>
      </div>
    </div>
  );
}
