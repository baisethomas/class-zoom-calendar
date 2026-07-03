import { formatClassTime, getDateKey, groupClassesByDate } from "@/features/classes/time";

export type DigestClass = {
  title: string;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  zoom_url: string;
  status: string;
};

function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function buildDigestEmail({
  classes,
  schoolName,
  timeZone,
  calendarUrl,
  unsubscribeUrl,
}: {
  classes: readonly DigestClass[];
  schoolName: string;
  timeZone: string;
  calendarUrl: string;
  unsubscribeUrl: string;
}): { subject: string; text: string } {
  const scheduled = classes.filter((classItem) => classItem.status === "scheduled");
  const subject =
    scheduled.length === 1
      ? `Reminder: 1 upcoming class at ${schoolName}`
      : `Reminder: ${scheduled.length} upcoming classes at ${schoolName}`;

  const lines: string[] = [`Upcoming classes at ${schoolName}:`, ""];
  for (const group of groupClassesByDate(scheduled, timeZone)) {
    lines.push(formatDateHeading(group.dateKey));
    for (const classItem of group.classes) {
      lines.push(
        `- ${classItem.title} with ${classItem.teacher_name}, ` +
          `${formatClassTime(classItem.starts_at, classItem.ends_at, timeZone)}`,
      );
      lines.push(`  Join: ${classItem.zoom_url}`);
    }
    lines.push("");
  }
  lines.push(`Full calendar: ${calendarUrl}`);
  lines.push("");
  lines.push(`Unsubscribe from reminders: ${unsubscribeUrl}`);

  return { subject, text: lines.join("\n") };
}

export function digestDateKey(now: Date, timeZone: string): string {
  return getDateKey(now, timeZone);
}
