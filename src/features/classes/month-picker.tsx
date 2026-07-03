import Link from "next/link";

type CalendarView = "agenda" | "month";

function parseDateKey(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError("Invalid calendar date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) throw new RangeError("Invalid calendar date");
  return { year, month, day };
}

function dateKey(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calendarHref(date: string, view: CalendarView): string {
  return `/calendar?date=${date}&view=${view}`;
}

export function buildMonthGrid(selectedDate: string): Array<{ date: string; inMonth: boolean }> {
  const { year, month } = parseDateKey(selectedDate);
  const monthIndex = month - 1;
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const leadingDays = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = dateKey(year, monthIndex, index - leadingDays + 1);
    return { date, inMonth: date.slice(0, 7) === selectedDate.slice(0, 7) };
  });
}

function longDate(date: string): string {
  const { year, month, day } = parseDateKey(date);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function MonthPicker({
  selectedDate,
  todayDate,
  view,
  classDateKeys,
  classTitlesByDate,
  showViewSwitcher = true,
  showTodayLink = true,
  forceMonthGrid = false,
  compact = false,
}: {
  selectedDate: string;
  todayDate: string;
  view: CalendarView;
  classDateKeys: ReadonlySet<string>;
  classTitlesByDate?: ReadonlyMap<string, readonly string[]>;
  showViewSwitcher?: boolean;
  showTodayLink?: boolean;
  forceMonthGrid?: boolean;
  compact?: boolean;
}) {
  const { year, month } = parseDateKey(selectedDate);
  const title = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  const previous = dateKey(year, month - 2, 1);
  const next = dateKey(year, month, 1);
  const days = buildMonthGrid(selectedDate);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );

  return (
    <section className={`month-picker${compact ? " month-picker--compact" : ""}`} aria-labelledby="month-title">
      {showViewSwitcher ? (
        <nav className="view-switcher" aria-label="Calendar views">
          <Link
            href={calendarHref(selectedDate, "agenda")}
            aria-current={view === "agenda" ? "page" : undefined}
          >
            Agenda view
          </Link>
          <Link
            href={calendarHref(selectedDate, "month")}
            aria-current={view === "month" ? "page" : undefined}
          >
            Month view
          </Link>
        </nav>
      ) : null}
      <div className="month-navigation">
        <Link href={calendarHref(previous, "month")} aria-label="Previous month">
          ←
        </Link>
        <h2 id="month-title">{title}</h2>
        <Link href={calendarHref(next, "month")} aria-label="Next month">
          →
        </Link>
      </div>
      {showTodayLink ? (
        <Link className="today-link" href={calendarHref(todayDate, view)}>
          Today
        </Link>
      ) : null}
      {view === "month" || forceMonthGrid ? (
        <table className="month-grid">
          <caption>{title}</caption>
          <thead>
            <tr>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                <th className="weekday" scope="col" key={weekday}>
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]!.date}>
                {week.map((item) => {
                  const hasClasses = classDateKeys.has(item.date);
                  const titles = classTitlesByDate?.get(item.date) ?? [];
                  const label = `${longDate(item.date)}${hasClasses ? ", classes scheduled" : ""}`;
                  return (
                    <td className="month-cell" key={item.date}>
                      <Link
                        className={`date-link${item.inMonth ? "" : " date-link--outside"}${hasClasses ? " date-link--has-classes" : ""}`}
                        href={calendarHref(item.date, view)}
                        aria-label={label}
                        aria-current={item.date === selectedDate ? "date" : undefined}
                      >
                        {Number(item.date.slice(-2))}
                        {titles.length > 0 ? (
                          <span className="cell-titles">
                            {titles.slice(0, 2).map((title, position) => (
                              <span className="cell-title" key={`${title}-${position}`}>
                                {title}
                              </span>
                            ))}
                            {titles.length > 2 ? (
                              <span className="cell-title cell-title--more">
                                +{titles.length - 2} more
                              </span>
                            ) : null}
                          </span>
                        ) : hasClasses ? (
                          <span className="has-classes-text">Class</span>
                        ) : null}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
