"use client";

import { useActionState } from "react";

type AccessState = { ok: true } | { ok: false; error: string };

export function AccessForm({
  action,
}: {
  action: (previousState: AccessState | undefined, formData: FormData) => Promise<AccessState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="access-form">
      <div className="field">
        <label htmlFor="access-code">Access code</label>
        <input
          id="access-code"
          name="accessCode"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-describedby={state && !state.ok ? "access-status" : undefined}
        />
      </div>
      {state && !state.ok ? (
        <p id="access-status" className="form-status" role="status" aria-live="polite">
          {state.error}
        </p>
      ) : null}
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Checking…" : "View calendar"}
      </button>
    </form>
  );
}
