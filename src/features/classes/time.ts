import { z } from "zod";

type DateInput = Date | string;

const isoInstantSchema = z.iso.datetime({ offset: true });

type ClassWithStart = {
  starts_at: DateInput;
};

export type LocalDateTimeFields = {
  date: string;
  time: string;
};

export type ClassDateGroup<T> = {
  dateKey: string;
  classes: T[];
};

function parseDate(value: DateInput, label: string): Date {
  if (typeof value === "string" && !isoInstantSchema.safeParse(value).success) {
    throw new RangeError(`Invalid ${label}`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`Invalid ${label}`);
  }
  return date;
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new RangeError(`Unable to format date part: ${type}`);
  }
  return value;
}

export function getDateKey(value: DateInput, timeZone: string): string {
  const date = parseDate(value, "date");
  const parts = dateFormatter(timeZone).formatToParts(date);
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function zonedPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
}

function zonedDateTimeParts(date: Date, timeZone: string) {
  const parts = zonedPartsFormatter(timeZone).formatToParts(date);
  return {
    year: Number(partValue(parts, "year")),
    month: Number(partValue(parts, "month")),
    day: Number(partValue(parts, "day")),
    hour: Number(partValue(parts, "hour")),
    minute: Number(partValue(parts, "minute")),
    second: Number(partValue(parts, "second")),
  };
}

function validateLocalDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Invalid local date");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new RangeError("Invalid local time");

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const validDate = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    year! < 2000 ||
    year! > 2100 ||
    hour! > 23 ||
    minute! > 59 ||
    validDate.getUTCFullYear() !== year ||
    validDate.getUTCMonth() !== month! - 1 ||
    validDate.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid local date and time");
  }

  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute! };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedDateTimeParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - date.getTime();
}

export function localDateTimeToUtcInstant(date: string, time: string, timeZone: string): string {
  const target = validateLocalDateTime(date, time);
  const localAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );

  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidate = localAsUtc - timeZoneOffsetMs(new Date(candidate), timeZone);
  }

  const resolved = zonedDateTimeParts(new Date(candidate), timeZone);
  if (
    resolved.year !== target.year ||
    resolved.month !== target.month ||
    resolved.day !== target.day ||
    resolved.hour !== target.hour ||
    resolved.minute !== target.minute
  ) {
    throw new RangeError("Local date and time does not exist in the configured time zone");
  }

  return new Date(candidate).toISOString();
}

export function instantToLocalDateTimeFields(
  value: DateInput,
  timeZone: string,
): LocalDateTimeFields {
  const parts = zonedDateTimeParts(parseDate(value, "date"), timeZone);
  const pad = (input: number) => String(input).padStart(2, "0");
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

function timeFormatter(
  timeZone: string,
  locale: string,
  includeTimeZone: boolean,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      ...(includeTimeZone ? { timeZoneName: "short" as const } : {}),
    });
  } catch {
    throw new RangeError(`Invalid time zone or locale: ${timeZone}`);
  }
}

function getTimeZoneName(date: Date, timeZone: string, locale: string): string {
  const parts = timeFormatter(timeZone, locale, true).formatToParts(date);
  return partValue(parts, "timeZoneName");
}

export function formatClassTime(
  startsAt: DateInput,
  endsAt: DateInput,
  timeZone: string,
  locale = "en-US",
): string {
  const start = parseDate(startsAt, "start date");
  const end = parseDate(endsAt, "end date");
  const startZone = getTimeZoneName(start, timeZone, locale);
  const endZone = getTimeZoneName(end, timeZone, locale);
  const formatter = timeFormatter(timeZone, locale, startZone !== endZone);

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function groupClassesByDate<T extends ClassWithStart>(
  classes: readonly T[],
  timeZone: string,
): ClassDateGroup<T>[] {
  // Validate the zone even for an empty collection.
  dateFormatter(timeZone);

  const sorted = classes
    .map((classItem) => {
      const start = parseDate(classItem.starts_at, "class start date");
      return {
        classItem,
        dateKey: getDateKey(start, timeZone),
        startsAt: start.getTime(),
      };
    })
    .sort((left, right) => left.startsAt - right.startsAt);

  const groups: ClassDateGroup<T>[] = [];
  for (const item of sorted) {
    const current = groups.at(-1);
    if (current?.dateKey === item.dateKey) {
      current.classes.push(item.classItem);
    } else {
      groups.push({ dateKey: item.dateKey, classes: [item.classItem] });
    }
  }

  return groups;
}
