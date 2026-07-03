import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Agenda } from "@/features/classes/agenda";
import { MonthPicker } from "@/features/classes/month-picker";
import {
  getNextParentClass,
  getParentClasses,
  type ParentClass,
} from "@/features/classes/queries";
import { getDateKey } from "@/features/classes/time";
import { LogoutButton } from "@/features/parent-access/logout-button";
import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";

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

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <div>
          <p className="eyebrow">Class Calendar</p>
          <h1>{result.school.display_name}</h1>
          <p className="calendar-subtitle">Upcoming online classes, in your school’s local time.</p>
        </div>
        <LogoutButton />
      </header>
      <div className="calendar-layout">
        <MonthPicker
          selectedDate={selectedDate}
          todayDate={todayDate}
          view={view}
          classDateKeys={classDateKeys}
        />
        <div className="calendar-content">
          {view === "agenda" ? (
            <Agenda
              classes={monthClasses}
              timeZone={result.school.timezone}
              nextClassId={nextClass?.id ?? null}
            />
          ) : monthClasses.length === 0 ? (
            <p className="empty-state">No classes scheduled</p>
          ) : (
            <p className="month-summary">
              {monthClasses.length} {monthClasses.length === 1 ? "class" : "classes"} scheduled
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
