import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/auth";
import {
  addDaysToDateKey,
  dateKeyDayDelta,
  isValidDateKey,
  MAX_SERIES_SPAN_DAYS,
  weeklyDateKeys,
} from "@/features/classes/recurrence";
import { parseClassCsv } from "@/features/classes/csv";
import { classInputSchema, isSafeZoomUrl, type ClassStatus } from "@/features/classes/schema";
import { instantToLocalDateTimeFields, localDateTimeToUtcInstant } from "@/features/classes/time";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassFormField =
  | "title"
  | "description"
  | "teacherName"
  | "date"
  | "startTime"
  | "endTime"
  | "zoomUrl"
  | "repeat"
  | "repeatUntil";

export type ClassFormValues = Record<ClassFormField, string>;
export type ClassFieldErrors = Partial<Record<ClassFormField, string[]>>;

export type ClassFormState =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors: ClassFieldErrors;
      values: ClassFormValues;
    };
type ClassFormFailure = Extract<ClassFormState, { ok: false }>;

export type ClassActionResult = { ok: true } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED_FORM_ERROR = "Please fix the highlighted fields.";
const SAVE_ERROR = "Unable to save class. Please try again.";
const STATUS_ERROR = "Unable to update class. Please try again.";
const DELETE_ERROR = "Unable to delete class. Please try again.";
const DUPLICATE_ERROR = "Unable to duplicate class. Please try again.";
const IMPORT_ERROR = "Unable to import classes. Please try again.";

function defaultValues(): ClassFormValues {
  return {
    title: "",
    description: "",
    teacherName: "",
    date: "",
    startTime: "",
    endTime: "",
    zoomUrl: "",
    repeat: "none",
    repeatUntil: "",
  };
}

function stringValue(formData: FormData, name: ClassFormField): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function valuesFromFormData(formData: FormData): ClassFormValues {
  return {
    title: stringValue(formData, "title"),
    description: stringValue(formData, "description"),
    teacherName: stringValue(formData, "teacherName"),
    date: stringValue(formData, "date"),
    startTime: stringValue(formData, "startTime"),
    endTime: stringValue(formData, "endTime"),
    zoomUrl: stringValue(formData, "zoomUrl"),
    repeat: stringValue(formData, "repeat") || "none",
    repeatUntil: stringValue(formData, "repeatUntil"),
  };
}

function trimmedLength(value: string) {
  return Array.from(value.trim()).length;
}

function validateDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    year! >= 2000 &&
    year! <= 2100 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function validateTime(value: string): boolean {
  if (!TIME_PATTERN.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour! >= 0 && hour! <= 23 && minute! >= 0 && minute! <= 59;
}

function validateRawValues(values: ClassFormValues): ClassFieldErrors {
  const fieldErrors: ClassFieldErrors = {};
  if (trimmedLength(values.title) < 1 || trimmedLength(values.title) > 120) {
    fieldErrors.title = ["Title must contain between 1 and 120 characters"];
  }
  if (trimmedLength(values.description) > 1000) {
    fieldErrors.description = ["Description must contain no more than 1000 characters"];
  }
  if (trimmedLength(values.teacherName) < 1 || trimmedLength(values.teacherName) > 120) {
    fieldErrors.teacherName = ["Teacher must contain between 1 and 120 characters"];
  }
  if (!validateDate(values.date)) {
    fieldErrors.date = ["Date must be a valid calendar date"];
  }
  if (!validateTime(values.startTime)) {
    fieldErrors.startTime = ["Start time must be valid"];
  }
  if (!validateTime(values.endTime)) {
    fieldErrors.endTime = ["End time must be valid"];
  }
  if (validateTime(values.startTime) && validateTime(values.endTime) && values.endTime <= values.startTime) {
    fieldErrors.endTime = ["End time must be later than start time"];
  }
  if (!isSafeZoomUrl(values.zoomUrl.trim())) {
    fieldErrors.zoomUrl = ["Must be a safe Zoom HTTPS URL"];
  }
  if (values.repeat !== "none" && values.repeat !== "weekly") {
    fieldErrors.repeat = ["Repeat must be none or weekly"];
  } else if (values.repeat === "weekly") {
    if (!isValidDateKey(values.repeatUntil)) {
      fieldErrors.repeatUntil = ["Repeat end date must be a valid calendar date"];
    } else if (validateDate(values.date)) {
      const spanDays = dateKeyDayDelta(values.date, values.repeatUntil);
      if (spanDays < 0) {
        fieldErrors.repeatUntil = ["Repeat end date must be on or after the class date"];
      } else if (spanDays > MAX_SERIES_SPAN_DAYS) {
        fieldErrors.repeatUntil = [`Repeat end date must be within ${MAX_SERIES_SPAN_DAYS} days of the class date`];
      }
    }
  }
  return fieldErrors;
}

function hasErrors(fieldErrors: ClassFieldErrors): boolean {
  return Object.keys(fieldErrors).length > 0;
}

function invalidState(values: ClassFormValues, fieldErrors: ClassFieldErrors): ClassFormFailure {
  return { ok: false, formError: REQUIRED_FORM_ERROR, fieldErrors, values };
}

function genericSaveError(values: ClassFormValues): ClassFormFailure {
  return { ok: false, formError: SAVE_ERROR, fieldErrors: {}, values };
}

function applySchemaErrors(values: ClassFormValues, error: z.ZodError): ClassFormFailure {
  const fieldErrors: ClassFieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path[0];
    const field =
      path === "startsAt" ? "startTime" : path === "endsAt" ? "endTime" : path;
    if (
      field === "title" ||
      field === "description" ||
      field === "teacherName" ||
      field === "zoomUrl" ||
      field === "date" ||
      field === "startTime" ||
      field === "endTime"
    ) {
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
  }
  return invalidState(values, fieldErrors);
}

async function schoolTimeZone(client: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data, error } = await client
    .from("school_settings")
    .select("timezone")
    .eq("id", true)
    .single();
  if (error || !data?.timezone) throw new Error("settings");
  new Intl.DateTimeFormat("en-US", { timeZone: data.timezone });
  return data.timezone;
}

type ClassPayload = {
  title: string;
  description: string | null;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  zoom_url: string;
  status: ClassStatus;
};

function nonexistentTimeError(values: ClassFormValues, date: string): ClassFormFailure {
  return invalidState(values, {
    date: [`Class time does not exist on ${date} in the school time zone`],
  });
}

async function classPayload(
  values: ClassFormValues,
  client: ReturnType<typeof createAdminClient>,
): Promise<ClassFormFailure | { ok: true; payload: ClassPayload; timeZone: string }> {
  let timeZone: string;
  let startsAt: string;
  let endsAt: string;
  try {
    timeZone = await schoolTimeZone(client);
  } catch {
    return genericSaveError(values);
  }
  try {
    startsAt = localDateTimeToUtcInstant(values.date, values.startTime, timeZone);
    endsAt = localDateTimeToUtcInstant(values.date, values.endTime, timeZone);
  } catch {
    return nonexistentTimeError(values, values.date);
  }

  const parsed = classInputSchema.safeParse({
    title: values.title,
    description: values.description,
    teacherName: values.teacherName,
    startsAt,
    endsAt,
    zoomUrl: values.zoomUrl,
    status: "scheduled",
  });
  if (!parsed.success) return applySchemaErrors(values, parsed.error);

  return {
    ok: true,
    timeZone,
    payload: {
      title: parsed.data.title,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
      teacher_name: parsed.data.teacherName,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      zoom_url: parsed.data.zoomUrl,
      status: parsed.data.status,
    },
  };
}

function seriesOccurrencePayloads(
  values: ClassFormValues,
  basePayload: ClassPayload,
  timeZone: string,
): ClassFormFailure | { ok: true; payloads: ClassPayload[] } {
  let dates: string[];
  try {
    dates = weeklyDateKeys(values.date, values.repeatUntil);
  } catch {
    return invalidState(values, {
      repeatUntil: ["Repeat end date must be within the allowed range"],
    });
  }

  const payloads: ClassPayload[] = [];
  for (const date of dates) {
    try {
      payloads.push({
        ...basePayload,
        starts_at: localDateTimeToUtcInstant(date, values.startTime, timeZone),
        ends_at: localDateTimeToUtcInstant(date, values.endTime, timeZone),
      });
    } catch {
      return nonexistentTimeError(values, date);
    }
  }
  return { ok: true, payloads };
}

function revalidateClassViews() {
  revalidatePath("/calendar");
  revalidatePath("/admin/classes");
}

function actionId(formData: FormData): string | null {
  const value = formData.get("id");
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export async function createClass(
  _previousState: ClassFormState | undefined,
  formData: FormData,
): Promise<ClassFormState> {
  "use server";

  await requireAdmin();
  const values = valuesFromFormData(formData);
  const rawErrors = validateRawValues(values);
  if (hasErrors(rawErrors)) return invalidState(values, rawErrors);

  const client = createAdminClient();
  const payloadResult = await classPayload(values, client);
  if (!payloadResult.ok) return payloadResult;

  if (values.repeat === "weekly") {
    const seriesResult = seriesOccurrencePayloads(values, payloadResult.payload, payloadResult.timeZone);
    if (!seriesResult.ok) return seriesResult;

    const seriesId = crypto.randomUUID();
    const rows = seriesResult.payloads.map((payload) => ({ ...payload, series_id: seriesId }));
    const { error } = await client.from("classes").insert(rows);
    if (error) return genericSaveError(values);
  } else {
    const { error } = await client.from("classes").insert(payloadResult.payload);
    if (error) return genericSaveError(values);
  }

  revalidateClassViews();
  return { ok: true };
}

export async function updateClass(
  id: string,
  _previousState: ClassFormState | undefined,
  formData: FormData,
): Promise<ClassFormState> {
  "use server";

  await requireAdmin();
  const values = valuesFromFormData(formData);
  const rawErrors = validateRawValues(values);
  if (!UUID_PATTERN.test(id)) rawErrors.title = [...(rawErrors.title ?? []), "Invalid class"];
  if (hasErrors(rawErrors)) return invalidState(values, rawErrors);

  const applyTo = formData.get("applyTo") === "future" ? "future" : "one";
  const client = createAdminClient();
  const payloadResult = await classPayload(values, client);
  if (!payloadResult.ok) return payloadResult;

  const sharedFields = {
    title: payloadResult.payload.title,
    description: payloadResult.payload.description,
    teacher_name: payloadResult.payload.teacher_name,
    zoom_url: payloadResult.payload.zoom_url,
  };

  if (applyTo === "future") {
    const { data: target, error: targetError } = await client
      .from("classes")
      .select("starts_at,series_id")
      .eq("id", id)
      .single();
    if (targetError || !target) return genericSaveError(values);

    if (target.series_id) {
      return updateSeriesFromOccurrence({
        client,
        values,
        sharedFields,
        timeZone: payloadResult.timeZone,
        seriesId: target.series_id,
        fromStartsAt: target.starts_at,
      });
    }
  }

  const { error } = await client
    .from("classes")
    .update({
      ...sharedFields,
      starts_at: payloadResult.payload.starts_at,
      ends_at: payloadResult.payload.ends_at,
    })
    .eq("id", id);
  if (error) return genericSaveError(values);

  revalidateClassViews();
  return { ok: true };
}

async function updateSeriesFromOccurrence({
  client,
  values,
  sharedFields,
  timeZone,
  seriesId,
  fromStartsAt,
}: {
  client: ReturnType<typeof createAdminClient>;
  values: ClassFormValues;
  sharedFields: Pick<ClassPayload, "title" | "description" | "teacher_name" | "zoom_url">;
  timeZone: string;
  seriesId: string;
  fromStartsAt: string;
}): Promise<ClassFormState> {
  const { data: members, error: membersError } = await client
    .from("classes")
    .select("id,starts_at")
    .eq("series_id", seriesId)
    .gte("starts_at", fromStartsAt);
  if (membersError || !members) return genericSaveError(values);

  // Shift every remaining occurrence by the same number of calendar days the
  // edited occurrence moved, and apply the new times in the school time zone.
  const editedLocalDate = instantToLocalDateTimeFields(fromStartsAt, timeZone).date;
  const dayShift = dateKeyDayDelta(editedLocalDate, values.date);

  const updates: Array<{ id: string; starts_at: string; ends_at: string }> = [];
  for (const member of members) {
    const memberDate = instantToLocalDateTimeFields(member.starts_at, timeZone).date;
    const shiftedDate = addDaysToDateKey(memberDate, dayShift);
    try {
      updates.push({
        id: member.id,
        starts_at: localDateTimeToUtcInstant(shiftedDate, values.startTime, timeZone),
        ends_at: localDateTimeToUtcInstant(shiftedDate, values.endTime, timeZone),
      });
    } catch {
      return nonexistentTimeError(values, shiftedDate);
    }
  }

  for (const update of updates) {
    const { error } = await client
      .from("classes")
      .update({ ...sharedFields, starts_at: update.starts_at, ends_at: update.ends_at })
      .eq("id", update.id);
    if (error) return genericSaveError(values);
  }

  revalidateClassViews();
  return { ok: true };
}

export async function setClassStatus(formData: FormData): Promise<ClassActionResult> {
  "use server";

  await requireAdmin();
  const id = actionId(formData);
  const status = formData.get("status");
  if (!id || (status !== "scheduled" && status !== "canceled")) {
    return { ok: false, error: "Invalid class status." };
  }

  const client = createAdminClient();
  const { error } = await client.from("classes").update({ status }).eq("id", id);
  if (error) return { ok: false, error: STATUS_ERROR };

  revalidateClassViews();
  return { ok: true };
}

export async function deleteClass(formData: FormData): Promise<ClassActionResult> {
  "use server";

  await requireAdmin();
  const id = actionId(formData);
  const confirmTitle = formData.get("confirmTitle");
  if (!id || typeof confirmTitle !== "string" || confirmTitle.length === 0 || confirmTitle.length > 120) {
    return { ok: false, error: "Type the class name exactly to delete." };
  }

  const scope = formData.get("scope") === "future" ? "future" : "one";
  const client = createAdminClient();
  const { data, error: lookupError } = await client
    .from("classes")
    .select("title,starts_at,series_id")
    .eq("id", id)
    .single();
  if (lookupError || !data?.title) return { ok: false, error: DELETE_ERROR };
  if (confirmTitle !== data.title) return { ok: false, error: "Type the class name exactly to delete." };

  if (scope === "future" && data.series_id) {
    const { error } = await client
      .from("classes")
      .delete()
      .eq("series_id", data.series_id)
      .gte("starts_at", data.starts_at);
    if (error) return { ok: false, error: DELETE_ERROR };
  } else {
    const { error } = await client.from("classes").delete().eq("id", id);
    if (error) return { ok: false, error: DELETE_ERROR };
  }

  revalidateClassViews();
  return { ok: true };
}

export async function duplicateClass(formData: FormData): Promise<ClassActionResult> {
  "use server";

  await requireAdmin();
  const id = actionId(formData);
  if (!id) return { ok: false, error: "Invalid class." };

  const client = createAdminClient();
  const { data, error: lookupError } = await client
    .from("classes")
    .select("title,description,teacher_name,starts_at,ends_at,zoom_url")
    .eq("id", id)
    .single();
  if (lookupError || !data) return { ok: false, error: DUPLICATE_ERROR };

  // Duplicate one week later at the same school-local wall-clock time, so the
  // copy survives DST transitions.
  let startsAt: string;
  let endsAt: string;
  try {
    const timeZone = await schoolTimeZone(client);
    const start = instantToLocalDateTimeFields(data.starts_at, timeZone);
    const end = instantToLocalDateTimeFields(data.ends_at, timeZone);
    startsAt = localDateTimeToUtcInstant(addDaysToDateKey(start.date, 7), start.time, timeZone);
    endsAt = localDateTimeToUtcInstant(addDaysToDateKey(end.date, 7), end.time, timeZone);
  } catch {
    return { ok: false, error: DUPLICATE_ERROR };
  }

  const { error } = await client.from("classes").insert({
    title: data.title,
    description: data.description,
    teacher_name: data.teacher_name,
    starts_at: startsAt,
    ends_at: endsAt,
    zoom_url: data.zoom_url,
    status: "scheduled",
  });
  if (error) return { ok: false, error: DUPLICATE_ERROR };

  revalidateClassViews();
  return { ok: true };
}

export type ImportRowError = { row: number; message: string };
export type ImportClassesState =
  | { ok: true; imported: number }
  | { ok: false; error?: string; rowErrors: ImportRowError[] };

function importFailure(error: string, rowErrors: ImportRowError[] = []): ImportClassesState {
  return { ok: false, error, rowErrors };
}

export async function importClasses(
  _previousState: ImportClassesState | undefined,
  formData: FormData,
): Promise<ImportClassesState> {
  "use server";

  await requireAdmin();

  let csvText = "";
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 200 * 1024) return importFailure("The CSV file is too large (200 KB limit).");
    csvText = await file.text();
  } else {
    const raw = formData.get("csv");
    csvText = typeof raw === "string" ? raw : "";
  }
  if (!csvText.trim()) return importFailure("Paste CSV rows or choose a CSV file.");

  const parsed = parseClassCsv(csvText);
  if (!parsed.ok) return importFailure(parsed.error);

  const client = createAdminClient();
  let timeZone: string;
  try {
    timeZone = await schoolTimeZone(client);
  } catch {
    return importFailure(IMPORT_ERROR);
  }

  const rowErrors: ImportRowError[] = [];
  const payloads: ClassPayload[] = [];
  for (const row of parsed.rows) {
    const values: ClassFormValues = {
      title: row.title,
      description: row.description,
      teacherName: row.teacherName,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      zoomUrl: row.zoomUrl,
      repeat: "none",
      repeatUntil: "",
    };
    const errors = validateRawValues(values);
    if (hasErrors(errors)) {
      rowErrors.push({
        row: row.rowNumber,
        message: Object.values(errors)[0]?.[0] ?? "Invalid row",
      });
      continue;
    }

    try {
      const startsAt = localDateTimeToUtcInstant(row.date, row.startTime, timeZone);
      const endsAt = localDateTimeToUtcInstant(row.date, row.endTime, timeZone);
      const parsedRow = classInputSchema.safeParse({
        title: row.title,
        description: row.description,
        teacherName: row.teacherName,
        startsAt,
        endsAt,
        zoomUrl: row.zoomUrl,
        status: "scheduled",
      });
      if (!parsedRow.success) {
        rowErrors.push({
          row: row.rowNumber,
          message: parsedRow.error.issues[0]?.message ?? "Invalid row",
        });
        continue;
      }
      payloads.push({
        title: parsedRow.data.title,
        description: parsedRow.data.description?.trim() ? parsedRow.data.description : null,
        teacher_name: parsedRow.data.teacherName,
        starts_at: parsedRow.data.startsAt,
        ends_at: parsedRow.data.endsAt,
        zoom_url: parsedRow.data.zoomUrl,
        status: parsedRow.data.status,
      });
    } catch {
      rowErrors.push({
        row: row.rowNumber,
        message: `Class time does not exist on ${row.date} in the school time zone`,
      });
    }
  }

  if (rowErrors.length > 0) {
    return importFailure("Fix the listed rows and try again. No classes were imported.", rowErrors);
  }

  const { error } = await client.from("classes").insert(payloads);
  if (error) return importFailure(IMPORT_ERROR);

  revalidateClassViews();
  return { ok: true, imported: payloads.length };
}

export function emptyClassFormValues(): ClassFormValues {
  return defaultValues();
}
