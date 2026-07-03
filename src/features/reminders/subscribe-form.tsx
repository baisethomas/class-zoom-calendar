"use client";

import { useActionState, useState } from "react";

import type { ReminderSubscribeState } from "@/features/reminders/actions";

type SubscribeAction = (
  previousState: ReminderSubscribeState | undefined,
  formData: FormData,
) => Promise<ReminderSubscribeState>;

export function ReminderSubscribeForm({ action }: { action: SubscribeAction }) {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previousState: ReminderSubscribeState | undefined, formData: FormData) => {
      const result = await action(previousState, formData);
      if (result.ok) setEmail("");
      return result;
    },
    undefined,
  );

  return (
    <section className="reminder-signup" aria-labelledby="reminder-signup-title">
      <h2 id="reminder-signup-title">Email reminders</h2>
      <p className="reminder-signup__intro">
        Get a daily email with the next day’s classes and Zoom links. Every email includes an
        unsubscribe link.
      </p>
      {state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">
          You’re subscribed to class reminders.
        </p>
      ) : state && !state.ok ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={formAction} className="reminder-signup__form">
        <div className="field">
          <label htmlFor="reminder-email">Email address</label>
          <input
            id="reminder-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </div>
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      </form>
    </section>
  );
}
