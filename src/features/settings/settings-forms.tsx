"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import type {
  AccessCodeFormState,
  FeedTokenFormState,
  SchoolSettingsFormState,
  SchoolSettingsFormValues,
} from "@/features/settings/admin-actions";

type SchoolSettingsAction = (
  previousState: SchoolSettingsFormState | undefined,
  formData: FormData,
) => Promise<SchoolSettingsFormState>;

type AccessCodeAction = (
  previousState: AccessCodeFormState | undefined,
  formData: FormData,
) => Promise<AccessCodeFormState>;

type FeedTokenAction = () => Promise<FeedTokenFormState>;

function settingsErrorId(name: keyof SchoolSettingsFormValues) {
  return `settings-${name}-error`;
}

function accessCodeErrorId() {
  return "access-code-error";
}

export function SchoolSettingsForm({
  action,
  initialValues,
}: {
  action: SchoolSettingsAction;
  initialValues: SchoolSettingsFormValues;
}) {
  const [values, setValues] = useState<SchoolSettingsFormValues>(initialValues);
  const submitAction = useCallback(
    async (previousState: SchoolSettingsFormState | undefined, formData: FormData) => {
      const result = await action(previousState, formData);
      if (!result.ok) setValues(result.values);
      return result;
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(submitAction, undefined);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state && !state.ok) summaryRef.current?.focus();
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : {};
  const hasError = state && !state.ok;
  const setValue = (name: keyof SchoolSettingsFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  const describedBy = (name: keyof SchoolSettingsFormValues) =>
    [
      hasError ? "settings-form-errors" : null,
      errors[name]?.length ? settingsErrorId(name) : null,
    ].filter(Boolean).join(" ") || undefined;

  return (
    <form action={formAction} className="class-form" aria-label="School settings">
      {hasError ? (
        <div
          id="settings-form-errors"
          className="form-status error-summary"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          ref={summaryRef}
        >
          <p>{state.formError ?? "Please fix the highlighted fields."}</p>
        </div>
      ) : state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">Settings saved.</p>
      ) : null}

      <div className="field">
        <label htmlFor="settings-display-name">School display name</label>
        <input
          id="settings-display-name"
          name="displayName"
          type="text"
          autoComplete="organization"
          required
          maxLength={120}
          value={values.displayName}
          onChange={(event) => setValue("displayName")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.displayName) || undefined}
          aria-describedby={describedBy("displayName")}
        />
        {errors.displayName ? (
          <p id={settingsErrorId("displayName")} className="field-error">{errors.displayName[0]}</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="settings-timezone">Timezone</label>
        <input
          id="settings-timezone"
          name="timezone"
          type="text"
          autoComplete="off"
          required
          value={values.timezone}
          onChange={(event) => setValue("timezone")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.timezone) || undefined}
          aria-describedby={describedBy("timezone")}
        />
        {errors.timezone ? (
          <p id={settingsErrorId("timezone")} className="field-error">{errors.timezone[0]}</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="settings-session-hours">Parent session duration</label>
        <input
          id="settings-session-hours"
          name="parentSessionHours"
          type="number"
          min={1}
          max={168}
          step={1}
          required
          value={values.parentSessionHours}
          onChange={(event) => setValue("parentSessionHours")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.parentSessionHours) || undefined}
          aria-describedby={describedBy("parentSessionHours")}
        />
        {errors.parentSessionHours ? (
          <p id={settingsErrorId("parentSessionHours")} className="field-error">
            {errors.parentSessionHours[0]}
          </p>
        ) : (
          <p className="field-help">Hours before parents need to enter the access code again.</p>
        )}
      </div>

      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function AccessCodeForm({
  action,
  hasAccessCode,
}: {
  action: AccessCodeAction;
  hasAccessCode: boolean;
}) {
  const [accessCode, setAccessCode] = useState("");
  const submitAction = useCallback(
    async (previousState: AccessCodeFormState | undefined, formData: FormData) => {
      const result = await action(previousState, formData);
      if (result.ok) setAccessCode("");
      return result;
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(submitAction, undefined);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state && !state.ok) summaryRef.current?.focus();
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : {};
  const hasError = state && !state.ok;
  const describedBy = [
    "access-code-status",
    hasError ? "access-code-form-errors" : null,
    errors.accessCode?.length ? accessCodeErrorId() : null,
  ].filter(Boolean).join(" ");

  return (
    <form action={formAction} className="class-form" aria-label="Parent access code">
      <p id="access-code-status" className="intro">
        {hasAccessCode
          ? "An access code is currently configured."
          : "No access code is configured."}
      </p>
      {hasError ? (
        <div
          id="access-code-form-errors"
          className="form-status error-summary"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          ref={summaryRef}
        >
          <p>{state.formError ?? "Please fix the highlighted fields."}</p>
        </div>
      ) : state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">Access code updated.</p>
      ) : null}

      <div className="field">
        <label htmlFor="settings-access-code">New shared access code</label>
        <input
          id="settings-access-code"
          name="accessCode"
          type="password"
          autoComplete="new-password"
          required
          maxLength={256}
          value={accessCode}
          onChange={(event) => setAccessCode(event.currentTarget.value)}
          aria-invalid={Boolean(errors.accessCode) || undefined}
          aria-describedby={describedBy}
        />
        {errors.accessCode ? (
          <p id={accessCodeErrorId()} className="field-error">{errors.accessCode[0]}</p>
        ) : (
          <p className="field-help">Share this code with parents. It will be stored as a hash only.</p>
        )}
      </div>

      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set access code"}
      </button>
    </form>
  );
}

export function CalendarFeedForm({
  action,
  feedUrl,
}: {
  action: FeedTokenAction;
  feedUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="class-form">
      <p id="calendar-feed-status" className="intro">
        {feedUrl
          ? "Parents can subscribe to this link in Google Calendar, Apple Calendar, or Outlook to keep the class schedule synced automatically."
          : "No calendar feed link exists yet. Generate one to let parents subscribe to the class schedule from their own calendar apps."}
      </p>
      {state && !state.ok ? (
        <p className="field-error" role="alert">{state.error}</p>
      ) : state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">Calendar feed link updated.</p>
      ) : null}

      {feedUrl ? (
        <div className="field">
          <label htmlFor="calendar-feed-url">Calendar subscription link</label>
          <input
            id="calendar-feed-url"
            type="url"
            readOnly
            value={feedUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby="calendar-feed-status"
          />
          <p className="field-help">
            Anyone with this link can read the class schedule. Regenerate it to revoke old links.
          </p>
        </div>
      ) : null}

      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            feedUrl &&
            !window.confirm(
              "Regenerate the calendar feed link? Parents using the old link will stop receiving updates.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Saving…" : feedUrl ? "Regenerate feed link" : "Generate feed link"}
        </button>
      </form>
    </div>
  );
}
