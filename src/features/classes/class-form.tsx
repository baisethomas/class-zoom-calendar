"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import type { ClassFormState, ClassFormValues } from "@/features/classes/admin-actions";

type ClassFormAction = (
  previousState: ClassFormState | undefined,
  formData: FormData,
) => Promise<ClassFormState>;

const EMPTY_VALUES: ClassFormValues = {
  title: "",
  description: "",
  teacherName: "",
  date: "",
  startTime: "",
  endTime: "",
  zoomUrl: "",
};

function fieldErrorId(name: keyof ClassFormValues) {
  return `class-${name}-error`;
}

export function ClassForm({
  action,
  initialValues,
  submitLabel = "Create class",
}: {
  action: ClassFormAction;
  initialValues?: Partial<ClassFormValues>;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<ClassFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const submitAction = useCallback(
    async (previousState: ClassFormState | undefined, formData: FormData) => {
      const result = await action(previousState, formData);
      if (!result.ok) {
        setValues({ ...EMPTY_VALUES, ...result.values });
      }
      return result;
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(submitAction, undefined);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state && !state.ok) {
      summaryRef.current?.focus();
    }
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : {};
  const hasError = state && !state.ok;
  const setValue = (name: keyof ClassFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  const describedBy = (name: keyof ClassFormValues) =>
    [hasError ? "class-form-errors" : null, errors[name]?.length ? fieldErrorId(name) : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form action={formAction} className="class-form">
      {hasError ? (
        <div
          id="class-form-errors"
          className="form-status error-summary"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          ref={summaryRef}
        >
          <p>{state.formError ?? "Please fix the highlighted fields."}</p>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="class-title">Title</label>
        <input
          id="class-title"
          name="title"
          type="text"
          autoComplete="off"
          required
          maxLength={120}
          value={values.title}
          onChange={(event) => setValue("title")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.title) || undefined}
          aria-describedby={describedBy("title")}
        />
        {errors.title ? <p id={fieldErrorId("title")} className="field-error">{errors.title[0]}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="class-description">Description</label>
        <textarea
          id="class-description"
          name="description"
          rows={4}
          maxLength={1000}
          value={values.description}
          onChange={(event) => setValue("description")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.description) || undefined}
          aria-describedby={describedBy("description")}
        />
        {errors.description ? (
          <p id={fieldErrorId("description")} className="field-error">{errors.description[0]}</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="class-teacher">Teacher</label>
        <input
          id="class-teacher"
          name="teacherName"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={values.teacherName}
          onChange={(event) => setValue("teacherName")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.teacherName) || undefined}
          aria-describedby={describedBy("teacherName")}
        />
        {errors.teacherName ? (
          <p id={fieldErrorId("teacherName")} className="field-error">{errors.teacherName[0]}</p>
        ) : null}
      </div>

      <div className="class-form__time-grid">
        <div className="field">
          <label htmlFor="class-date">Date</label>
          <input
            id="class-date"
            name="date"
            type="date"
            required
            value={values.date}
            onChange={(event) => setValue("date")(event.currentTarget.value)}
            aria-invalid={Boolean(errors.date) || undefined}
            aria-describedby={describedBy("date")}
          />
          {errors.date ? <p id={fieldErrorId("date")} className="field-error">{errors.date[0]}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="class-start-time">Start time</label>
          <input
            id="class-start-time"
            name="startTime"
            type="time"
            required
            value={values.startTime}
            onChange={(event) => setValue("startTime")(event.currentTarget.value)}
            aria-invalid={Boolean(errors.startTime) || undefined}
            aria-describedby={describedBy("startTime")}
          />
          {errors.startTime ? (
            <p id={fieldErrorId("startTime")} className="field-error">{errors.startTime[0]}</p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="class-end-time">End time</label>
          <input
            id="class-end-time"
            name="endTime"
            type="time"
            required
            value={values.endTime}
            onChange={(event) => setValue("endTime")(event.currentTarget.value)}
            aria-invalid={Boolean(errors.endTime) || undefined}
            aria-describedby={describedBy("endTime")}
          />
          {errors.endTime ? (
            <p id={fieldErrorId("endTime")} className="field-error">{errors.endTime[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="field">
        <label htmlFor="class-zoom-url">Zoom URL</label>
        <input
          id="class-zoom-url"
          name="zoomUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          value={values.zoomUrl}
          onChange={(event) => setValue("zoomUrl")(event.currentTarget.value)}
          aria-invalid={Boolean(errors.zoomUrl) || undefined}
          aria-describedby={describedBy("zoomUrl")}
        />
        {errors.zoomUrl ? (
          <p id={fieldErrorId("zoomUrl")} className="field-error">{errors.zoomUrl[0]}</p>
        ) : null}
      </div>

      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
