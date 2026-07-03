"use client";

import { useActionState } from "react";

import type { AdminActionState } from "@/features/admin/auth";

export function LogoutForm({ action }: { action: () => Promise<AdminActionState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      {state ? <p className="form-status" role="status" aria-live="polite">{state.error}</p> : null}
      <button className="secondary-action" type="submit" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
