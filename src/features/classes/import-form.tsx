"use client";

import { useActionState } from "react";

import type { ImportClassesState } from "@/features/classes/admin-actions";

type ImportAction = (
  previousState: ImportClassesState | undefined,
  formData: FormData,
) => Promise<ImportClassesState>;

export function ImportClassesForm({ action }: { action: ImportAction }) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="class-form">
      {state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">
          Imported {state.imported} {state.imported === 1 ? "class" : "classes"}.
        </p>
      ) : state && !state.ok ? (
        <div className="form-status error-summary" role="alert">
          {state.error ? <p>{state.error}</p> : null}
          {state.rowErrors.length > 0 ? (
            <ul className="import-form__row-errors">
              {state.rowErrors.map((rowError) => (
                <li key={`${rowError.row}-${rowError.message}`}>
                  <span className="import-form__row-badge">Row {rowError.row}</span>
                  <span>{rowError.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="import-file">CSV file</label>
        <input id="import-file" name="file" type="file" accept=".csv,text/csv" />
      </div>

      <div className="field">
        <label htmlFor="import-csv">Or paste CSV rows</label>
        <textarea
          className="import-form__textarea"
          id="import-csv"
          name="csv"
          rows={10}
          placeholder={"title,teacher,date,start_time,end_time,zoom_url,description\nAlgebra I,Ada Lovelace,2026-09-01,16:00,17:00,https://school.zoom.us/j/123,Linear equations"}
        />
        <p className="field-help">
          Required columns: title, teacher, date (YYYY-MM-DD), start_time and end_time (24-hour
          HH:MM, school time zone), zoom_url. The description column is optional. Nothing is
          imported unless every row is valid.
        </p>
      </div>

      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import classes"}
      </button>
    </form>
  );
}
