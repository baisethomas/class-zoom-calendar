import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/auth";
import { classInputSchema, isSafeZoomUrl, type ClassStatus } from "@/features/classes/schema";
import { localDateTimeToUtcInstant } from "@/features/classes/time";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassFormField = "title" | "description" | "teacherName" | "date" | "startTime" | "endTime" | "zoomUrl";

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

function defaultValues(): ClassFormValues {
  return {
    title: "",
    description: "",
    teacherName: "",
    date: "",
    startTime: "",
    endTime: "",
    zoomUrl: "",
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

async function classPayload(
  values: ClassFormValues,
  client: ReturnType<typeof createAdminClient>,
): Promise<ClassFormFailure | {
  ok: true;
  payload: {
    title: string;
    description: string | null;
    teacher_name: string;
    starts_at: string;
    ends_at: string;
    zoom_url: string;
    status: ClassStatus;
  };
}> {
  let timeZone: string;
  let startsAt: string;
  let endsAt: string;
  try {
    timeZone = await schoolTimeZone(client);
    startsAt = localDateTimeToUtcInstant(values.date, values.startTime, timeZone);
    endsAt = localDateTimeToUtcInstant(values.date, values.endTime, timeZone);
  } catch {
    return genericSaveError(values);
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

  const { error } = await client.from("classes").insert(payloadResult.payload);
  if (error) return genericSaveError(values);

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

  const client = createAdminClient();
  const payloadResult = await classPayload(values, client);
  if (!payloadResult.ok) return payloadResult;

  const { error } = await client
    .from("classes")
    .update({
      title: payloadResult.payload.title,
      description: payloadResult.payload.description,
      teacher_name: payloadResult.payload.teacher_name,
      starts_at: payloadResult.payload.starts_at,
      ends_at: payloadResult.payload.ends_at,
      zoom_url: payloadResult.payload.zoom_url,
    })
    .eq("id", id);
  if (error) return genericSaveError(values);

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

  const client = createAdminClient();
  const { data, error: lookupError } = await client
    .from("classes")
    .select("title")
    .eq("id", id)
    .single();
  if (lookupError || !data?.title) return { ok: false, error: DELETE_ERROR };
  if (confirmTitle !== data.title) return { ok: false, error: "Type the class name exactly to delete." };

  const { error } = await client.from("classes").delete().eq("id", id);
  if (error) return { ok: false, error: DELETE_ERROR };

  revalidateClassViews();
  return { ok: true };
}

export function emptyClassFormValues(): ClassFormValues {
  return defaultValues();
}
