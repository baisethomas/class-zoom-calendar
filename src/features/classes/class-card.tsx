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
      <div className="class-card__topline">
        <p className="class-time">
          <time dateTime={classItem.starts_at}>
            {formatClassTime(classItem.starts_at, classItem.ends_at, timeZone)}
          </time>
        </p>
        {isNext ? <span className="status-pill status-pill--next">Next class</span> : null}
        {canceled ? <span className="status-pill status-pill--canceled">Canceled</span> : null}
      </div>
      <h3>{classItem.title}</h3>
      <p className="teacher">Teacher: {classItem.teacher_name}</p>
      {classItem.description ? <p className="class-description">{classItem.description}</p> : null}
      {canJoin ? (
        <a
          className="join-action"
          href={classItem.zoom_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Join ${classItem.title} on Zoom (opens in a new tab)`}
        >
          Join on Zoom
        </a>
      ) : canceled ? null : (
        <p className="link-unavailable">Link unavailable</p>
      )}
    </article>
  );
}
