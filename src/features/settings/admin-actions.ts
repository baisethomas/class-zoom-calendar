import "server-only";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/features/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type SchoolSettingsField = "displayName" | "timezone" | "parentSessionHours";

export type SchoolSettingsFormValues = Record<SchoolSettingsField, string>;
export type SchoolSettingsFieldErrors = Partial<Record<SchoolSettingsField, string[]>>;
export type SchoolSettingsFormState =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors: SchoolSettingsFieldErrors;
      values: SchoolSettingsFormValues;
    };

export type AccessCodeFormState =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors: Partial<Record<"accessCode", string[]>>;
    };

const REQUIRED_FORM_ERROR = "Please fix the highlighted fields.";
const SETTINGS_SAVE_ERROR = "Unable to save settings. Please try again.";
const ACCESS_CODE_SAVE_ERROR = "Unable to save access code. Please try again.";
const MAX_SESSION_HOURS = 168;

function stringValue(formData: FormData, name: SchoolSettingsField): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function valuesFromFormData(formData: FormData): SchoolSettingsFormValues {
  return {
    displayName: stringValue(formData, "displayName"),
    timezone: stringValue(formData, "timezone"),
    parentSessionHours: stringValue(formData, "parentSessionHours"),
  };
}

function trimmedLength(value: string): number {
  return Array.from(value.trim()).length;
}

function hasErrors(fieldErrors: Record<string, unknown>): boolean {
  return Object.keys(fieldErrors).length > 0;
}

function isValidTimeZone(value: string): boolean {
  if (value === "UTC") return true;
  if (Intl.supportedValuesOf && !Intl.supportedValuesOf("timeZone").includes(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validateSettings(values: SchoolSettingsFormValues): SchoolSettingsFieldErrors {
  const fieldErrors: SchoolSettingsFieldErrors = {};
  const displayNameLength = trimmedLength(values.displayName);
  if (displayNameLength < 1 || displayNameLength > 120) {
    fieldErrors.displayName = ["Display name must contain between 1 and 120 characters"];
  }

  const timezone = values.timezone.trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    fieldErrors.timezone = ["Timezone must be a valid IANA timezone"];
  }

  const sessionHours = Number(values.parentSessionHours);
  if (
    !Number.isInteger(sessionHours) ||
    sessionHours < 1 ||
    sessionHours > MAX_SESSION_HOURS
  ) {
    fieldErrors.parentSessionHours = [`Session duration must be between 1 and ${MAX_SESSION_HOURS} hours`];
  }

  return fieldErrors;
}

function invalidSettingsState(
  values: SchoolSettingsFormValues,
  fieldErrors: SchoolSettingsFieldErrors,
): Extract<SchoolSettingsFormState, { ok: false }> {
  return { ok: false, formError: REQUIRED_FORM_ERROR, fieldErrors, values };
}

function genericSettingsError(values: SchoolSettingsFormValues): Extract<SchoolSettingsFormState, { ok: false }> {
  return { ok: false, formError: SETTINGS_SAVE_ERROR, fieldErrors: {}, values };
}

function revalidateSettingsViews(includeCalendar: boolean) {
  revalidatePath("/admin/settings");
  revalidatePath("/access");
  if (includeCalendar) revalidatePath("/calendar");
}

export async function updateSchoolSettings(
  _previousState: SchoolSettingsFormState | undefined,
  formData: FormData,
): Promise<SchoolSettingsFormState> {
  "use server";

  await requireAdmin();
  const values = valuesFromFormData(formData);
  const fieldErrors = validateSettings(values);
  if (hasErrors(fieldErrors)) return invalidSettingsState(values, fieldErrors);

  const parentSessionHours = Number(values.parentSessionHours);
  const client = createAdminClient();
  const { error } = await client
    .from("school_settings")
    .update({
      display_name: values.displayName.trim(),
      timezone: values.timezone.trim(),
      parent_session_hours: parentSessionHours,
    })
    .eq("id", true);
  if (error) return genericSettingsError(values);

  revalidateSettingsViews(true);
  return { ok: true };
}

function validateAccessCode(formData: FormData): string | AccessCodeFormState {
  const rawCode = formData.get("accessCode");
  if (typeof rawCode !== "string") {
    return {
      ok: false,
      formError: REQUIRED_FORM_ERROR,
      fieldErrors: { accessCode: ["Access code is required"] },
    };
  }

  const code = rawCode.trim();
  if (!code) {
    return {
      ok: false,
      formError: REQUIRED_FORM_ERROR,
      fieldErrors: { accessCode: ["Access code is required"] },
    };
  }
  if (code.length > 256 || bcrypt.truncates(code)) {
    return {
      ok: false,
      formError: REQUIRED_FORM_ERROR,
      fieldErrors: { accessCode: ["Access code must be shorter"] },
    };
  }

  return code;
}

export async function rotateParentAccessCode(
  _previousState: AccessCodeFormState | undefined,
  formData: FormData,
): Promise<AccessCodeFormState> {
  "use server";

  await requireAdmin();
  const code = validateAccessCode(formData);
  if (typeof code !== "string") return code;

  const accessCodeHash = await bcrypt.hash(code, 12);
  const client = createAdminClient();
  const { error } = await client
    .from("school_settings")
    .update({ access_code_hash: accessCodeHash })
    .eq("id", true);
  if (error) {
    return { ok: false, formError: ACCESS_CODE_SAVE_ERROR, fieldErrors: {} };
  }

  revalidateSettingsViews(false);
  return { ok: true };
}
