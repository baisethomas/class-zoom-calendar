export default function CalendarLoading() {
  return (
    <div className="calendar-page" role="status" aria-live="polite">
      <p className="eyebrow">Class Calendar</p>
      <h1>Loading your classes…</h1>
      <div className="calendar-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
