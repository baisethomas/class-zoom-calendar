const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_SERIES_OCCURRENCES = 53;
export const MAX_SERIES_SPAN_DAYS = 366;

function dateKeyToUtcMs(dateKey: string): number {
  if (!DATE_KEY_PATTERN.test(dateKey)) throw new RangeError("Invalid calendar date");
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    year! < 2000 ||
    year! > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid calendar date");
  }
  return date.getTime();
}

function utcMsToDateKey(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidDateKey(dateKey: string): boolean {
  try {
    dateKeyToUtcMs(dateKey);
    return true;
  } catch {
    return false;
  }
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("Day offset must be an integer");
  return utcMsToDateKey(dateKeyToUtcMs(dateKey) + days * DAY_MS);
}

export function dateKeyDayDelta(from: string, to: string): number {
  return Math.round((dateKeyToUtcMs(to) - dateKeyToUtcMs(from)) / DAY_MS);
}

/**
 * Calendar dates for a weekly series: the start date plus every seventh day
 * up to and including the until date.
 */
export function weeklyDateKeys(startDate: string, untilDate: string): string[] {
  const startMs = dateKeyToUtcMs(startDate);
  const untilMs = dateKeyToUtcMs(untilDate);
  if (untilMs < startMs) throw new RangeError("Series end date must not be before the start date");
  if (untilMs - startMs > MAX_SERIES_SPAN_DAYS * DAY_MS) {
    throw new RangeError(`Series may span at most ${MAX_SERIES_SPAN_DAYS} days`);
  }

  const dates: string[] = [];
  for (let ms = startMs; ms <= untilMs; ms += 7 * DAY_MS) {
    dates.push(utcMsToDateKey(ms));
  }
  return dates;
}
