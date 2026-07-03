"use client";

import { useActionState, useState } from "react";

import type { ManageAdminState } from "@/features/settings/admin-actions";

export type AdminEntry = {
  user_id: string;
  label: string | null;
};

type AddAdminAction = (
  previousState: ManageAdminState | undefined,
  formData: FormData,
) => Promise<ManageAdminState>;

type RemoveAdminAction = (formData: FormData) => Promise<ManageAdminState>;

function RemoveAdminForm({
  admin,
  action,
}: {
  admin: AdminEntry;
  action: RemoveAdminAction;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previousState: ManageAdminState | undefined, formData: FormData) => action(formData),
    undefined,
  );
  const name = admin.label || admin.user_id;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Remove administrator access for ${name}?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={admin.user_id} />
      <button
        className="danger-action"
        type="submit"
        disabled={pending}
        aria-label={`Remove administrator ${name}`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state && !state.ok ? (
        <p className="field-error" role="alert">{state.error}</p>
      ) : null}
    </form>
  );
}

export function AdminsList({
  admins,
  bootstrapAdminId,
  currentUserId,
  addAction,
  removeAction,
}: {
  admins: AdminEntry[];
  bootstrapAdminId: string | null;
  currentUserId: string;
  addAction: AddAdminAction;
  removeAction: RemoveAdminAction;
}) {
  const [userId, setUserId] = useState("");
  const [label, setLabel] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previousState: ManageAdminState | undefined, formData: FormData) => {
      const result = await addAction(previousState, formData);
      if (result.ok) {
        setUserId("");
        setLabel("");
      }
      return result;
    },
    undefined,
  );

  return (
    <div className="class-form">
      <p className="intro">
        Administrators sign in with their Supabase Auth account and have full access to classes
        and settings. The bootstrap administrator is configured by the ADMIN_USER_ID environment
        variable and cannot be removed here.
      </p>

      <ul className="admins-list">
        {bootstrapAdminId ? (
          <li className="admins-list__row">
            <div>
              <p className="admins-list__id">{bootstrapAdminId}</p>
              <p className="field-help">
                Bootstrap administrator{bootstrapAdminId === currentUserId ? " (you)" : ""}
              </p>
            </div>
          </li>
        ) : null}
        {admins.map((admin) => (
          <li className="admins-list__row" key={admin.user_id}>
            <div>
              <p className="admins-list__id">{admin.user_id}</p>
              <p className="field-help">
                {admin.label || "No label"}
                {admin.user_id === currentUserId ? " (you)" : ""}
              </p>
            </div>
            <RemoveAdminForm admin={admin} action={removeAction} />
          </li>
        ))}
      </ul>

      {state?.ok ? (
        <p className="form-status" role="status" aria-live="polite">Administrator added.</p>
      ) : state && !state.ok ? (
        <p className="field-error" role="alert">{state.error}</p>
      ) : null}

      <form action={formAction} className="class-form" aria-label="Add administrator">
        <div className="field">
          <label htmlFor="admin-user-id">Supabase Auth user id</label>
          <input
            id="admin-user-id"
            name="userId"
            type="text"
            autoComplete="off"
            required
            value={userId}
            onChange={(event) => setUserId(event.currentTarget.value)}
          />
          <p className="field-help">
            Create the user in Supabase Auth first, then paste their user id (UUID) here.
          </p>
        </div>
        <div className="field">
          <label htmlFor="admin-label">Label (optional)</label>
          <input
            id="admin-label"
            name="label"
            type="text"
            autoComplete="off"
            maxLength={120}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </div>
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add administrator"}
        </button>
      </form>
    </div>
  );
}
