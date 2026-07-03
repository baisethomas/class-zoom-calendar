import { JoinAction, LiveBadge } from "@/features/classes/live-status";
import { isSafeZoomUrl } from "@/features/classes/schema";
import { formatClassTime } from "@/features/classes/time";
import type { ParentClass } from "@/features/classes/queries";

export function ClassCard({
  classItem,
  timeZone,
  isNext = false,
}: {
  classItem: ParentClass;
  timeZone: string;
  isNext?: boolean;
}) {
  const canceled = classItem.status === "canceled";
  const canJoin = classItem.status === "scheduled" && isSafeZoomUrl(classItem.zoom_url);

  return (
    <article
      className={`class-card${isNext ? " class-card--next" : ""}`}
      data-next={isNext || undefined}
    >
      <div className="class-card__grid">
        <div className="class-card__topline">
          <p className="class-time">
            <time dateTime={classItem.starts_at}>
              {formatClassTime(classItem.starts_at, classItem.ends_at, timeZone)}
            </time>
          </p>
          <div className="class-card__pills">
            {isNext ? <span className="status-pill status-pill--next">Next class</span> : null}
            {canceled ? <span className="status-pill status-pill--canceled">Canceled</span> : null}
            {!canceled ? <LiveBadge startsAt={classItem.starts_at} endsAt={classItem.ends_at} /> : null}
          </div>
        </div>
        <div className="class-card__content">
          <h3>{classItem.title}</h3>
          <p className="teacher">Teacher: {classItem.teacher_name}</p>
          {classItem.description ? <p className="class-description">{classItem.description}</p> : null}
          {!canJoin && !canceled ? <p className="link-unavailable">Link unavailable</p> : null}
        </div>
        {canJoin ? (
          <div className="class-card__actions">
            <JoinAction
              href={classItem.zoom_url}
              title={classItem.title}
              startsAt={classItem.starts_at}
              endsAt={classItem.ends_at}
            />
            <a
              className="calendar-download"
              href={`/api/class-ics?id=${classItem.id}`}
              aria-label={`Add ${classItem.title} to your calendar`}
            >
              Add to calendar
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}
