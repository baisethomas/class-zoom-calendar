"use client";

import { useActionState } from "react";

import type { AdminActionState } from "@/features/admin/auth";

export function LoginForm({
  action,
}: {
  action: (
    previousState: AdminActionState | undefined,
    formData: FormData,
  ) => Promise<AdminActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="access-form">
      <div className="field">
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state ? <p className="form-status" role="status" aria-live="polite">{state.error}</p> : null}
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
