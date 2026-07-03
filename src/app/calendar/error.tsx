"use client";

export default function CalendarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="calendar-page error-panel" role="alert">
      <p className="eyebrow">Class Calendar</p>
      <h1>We couldn’t load the calendar.</h1>
      <p>Please try again. Your class details are still private.</p>
      <button className="primary-action" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
