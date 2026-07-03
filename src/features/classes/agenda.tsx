import { ClassCard } from "@/features/classes/class-card";
import type { ParentClass } from "@/features/classes/queries";
import { groupClassesByDate } from "@/features/classes/time";

function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function Agenda({
  classes,
  timeZone,
  nextClassId,
}: {
  classes: readonly ParentClass[];
  timeZone: string;
  nextClassId: string | null;
}) {
  if (classes.length === 0) return <p className="empty-state">No classes scheduled</p>;

  const groups = groupClassesByDate(classes, timeZone);

  return (
    <div className="agenda">
      {groups.map((group) => (
        <section
          className="agenda-day"
          key={group.dateKey}
          aria-labelledby={`date-${group.dateKey}`}
        >
          <h2 id={`date-${group.dateKey}`}>{formatDateHeading(group.dateKey)}</h2>
          <div className="class-list">
            {group.classes.map((classItem) => (
              <ClassCard
                key={classItem.id}
                classItem={classItem}
                timeZone={timeZone}
                isNext={classItem.id === nextClassId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
