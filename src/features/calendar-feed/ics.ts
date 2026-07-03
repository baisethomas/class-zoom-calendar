export type IcsClass = {
  id: string;
  title: string;
  description: string | null;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  zoom_url: string;
  status: string;
};

const CRLF = "\r\n";

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

function formatInstant(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new RangeError("Invalid calendar instant");
  return new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold content lines longer than 75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string[] {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return [line];

  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length;
    if (currentBytes + charBytes > limit) {
      folded.push(current);
      current = " ";
      currentBytes = 1;
      limit = 75;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) folded.push(current);
  return folded;
}

function eventLines(classItem: IcsClass, host: string, generatedAt: string): string[] {
  const descriptionParts = [`Teacher: ${classItem.teacher_name}`];
  if (classItem.description) descriptionParts.push(classItem.description);
  descriptionParts.push(`Join on Zoom: ${classItem.zoom_url}`);

  return [
    "BEGIN:VEVENT",
    `UID:${escapeText(classItem.id)}@${escapeText(host)}`,
    `DTSTAMP:${formatInstant(generatedAt)}`,
    `DTSTART:${formatInstant(classItem.starts_at)}`,
    `DTEND:${formatInstant(classItem.ends_at)}`,
    `SUMMARY:${escapeText(classItem.title)}`,
    `DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`,
    `URL:${escapeText(classItem.zoom_url)}`,
    `STATUS:${classItem.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

export function buildCalendarIcs({
  classes,
  calendarName,
  host,
  generatedAt,
}: {
  classes: readonly IcsClass[];
  calendarName: string;
  host: string;
  generatedAt: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//class-zoom-calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...classes.flatMap((classItem) => eventLines(classItem, host, generatedAt)),
    "END:VCALENDAR",
  ];

  return lines.flatMap(foldLine).join(CRLF) + CRLF;
}
