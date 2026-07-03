"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { formatClassTime } from "@/features/classes/time";
import type { Tables } from "@/lib/supabase/database.types";

export type AdminClass = Pick<
  Tables<"classes">,
  | "id"
  | "title"
  | "description"
  | "teacher_name"
  | "starts_at"
  | "ends_at"
  | "zoom_url"
  | "status"
  | "series_id"
>;

type Action = (formData: FormData) => void | Promise<unknown>;
type NativeFormAction = Exclude<ComponentProps<"form">["action"], string | undefined>;
type ActionResult = { ok: true } | { ok: false; error: string };

function actionResult(value: unknown): ActionResult {
  if (
    value &&
    typeof value === "object" &&
    "ok" in value &&
    value.ok === false &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return { ok: false, error: value.error };
  }
  return { ok: true };
}

function statusLabel(status: string) {
  return status === "canceled" ? "Canceled" : "Scheduled";
}

function byStartAscending(left: AdminClass, right: AdminClass) {
  return Date.parse(left.starts_at) - Date.parse(right.starts_at);
}

function ClassRow({
  classItem,
  timeZone,
  setStatusAction,
  duplicateAction,
  onDelete,
}: {
  classItem: AdminClass;
  timeZone: string;
  setStatusAction: Action;
  duplicateAction: Action;
  onDelete: (classItem: AdminClass, opener: HTMLButtonElement) => void;
}) {
  const canceled = classItem.status === "canceled";
  const nextStatus = canceled ? "scheduled" : "canceled";
  const actionLabel = canceled ? "Restore" : "Cancel";
  const [statusState, statusFormAction, statusPending] = useActionState(
    async (_previousState: ActionResult | undefined, formData: FormData) =>
      actionResult(await setStatusAction(formData)),
    undefined,
  );
  const [duplicateState, duplicateFormAction, duplicatePending] = useActionState(
    async (_previousState: ActionResult | undefined, formData: FormData) =>
      actionResult(await duplicateAction(formData)),
    undefined,
  );

  return (
    <li className="admin-class-row">
      <div className="admin-class-summary">
        <h3>{classItem.title}</h3>
        <p className="class-time">
          <time dateTime={classItem.starts_at}>
            {formatClassTime(classItem.starts_at, classItem.ends_at, timeZone)}
          </time>
        </p>
        <p className="teacher">Teacher: {classItem.teacher_name}</p>
        {classItem.description ? <p className="admin-class-description">{classItem.description}</p> : null}
      </div>
      <div className="admin-class-pills">
        <span className={`status-pill status-pill--${classItem.status}`}>{statusLabel(classItem.status)}</span>
        {classItem.series_id ? <span className="status-pill status-pill--series">Weekly series</span> : null}
      </div>
      <div className="admin-class-actions">
        <Link className="secondary-action" href={`/admin/classes/${classItem.id}/edit`} aria-label={`Edit ${classItem.title}`}>
          Edit
        </Link>
        <form
          action={statusFormAction as NativeFormAction}
          onSubmit={(event) => {
            if (!window.confirm(`${actionLabel} ${classItem.title}?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={classItem.id} />
          <input type="hidden" name="status" value={nextStatus} />
          <button
            className="secondary-action"
            type="submit"
            disabled={statusPending}
            aria-label={`${actionLabel} ${classItem.title}`}
          >
            {statusPending ? "Saving…" : actionLabel}
          </button>
        </form>
        <form
          action={duplicateFormAction as NativeFormAction}
          onSubmit={(event) => {
            if (!window.confirm(`Duplicate ${classItem.title} to next week?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={classItem.id} />
          <button
            className="secondary-action"
            type="submit"
            disabled={duplicatePending}
            aria-label={`Duplicate ${classItem.title} to next week`}
          >
            {duplicatePending ? "Saving…" : "Duplicate"}
          </button>
        </form>
        <button
          className="danger-action"
          type="button"
          onClick={(event) => onDelete(classItem, event.currentTarget)}
          aria-label={`Delete ${classItem.title}`}
        >
          Delete
        </button>
      </div>
      {statusState && !statusState.ok ? (
        <p className="field-error" role="alert">
          {statusState.error}
        </p>
      ) : null}
      {duplicateState && !duplicateState.ok ? (
        <p className="field-error" role="alert">
          {duplicateState.error}
        </p>
      ) : null}
    </li>
  );
}

function DeleteDialog({
  classItem,
  deleteAction,
  onClose,
}: {
  classItem: AdminClass;
  deleteAction: Action;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const matches = confirmation === classItem.title;
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    async (_previousState: ActionResult | undefined, formData: FormData) =>
      actionResult(await deleteAction(formData)),
    undefined,
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (deleteState?.ok) onClose();
  }, [deleteState, onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-class-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="delete-class-title">Delete {classItem.title}</h2>
        <p>
          This permanently deletes <strong>{classItem.title}</strong> from the calendar.
          {classItem.series_id
            ? " This class is part of a weekly series."
            : null}
        </p>
        {deleteState && !deleteState.ok ? (
          <p className="field-error" role="alert">
            {deleteState.error}
          </p>
        ) : null}
        <form
          action={deleteFormAction as NativeFormAction}
          onSubmit={(event) => {
            if (!matches) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={classItem.id} />
          {classItem.series_id ? (
            <fieldset className="field series-scope">
              <legend>Delete scope</legend>
              <label className="series-scope__option">
                <input type="radio" name="scope" value="one" defaultChecked />
                This class only
              </label>
              <label className="series-scope__option">
                <input type="radio" name="scope" value="future" />
                This and future classes in the series
              </label>
            </fieldset>
          ) : null}
          <div className="field">
            <label htmlFor="delete-confirm-title">Type {classItem.title} to confirm</label>
            <input
              ref={inputRef}
              id="delete-confirm-title"
              name="confirmTitle"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              autoComplete="off"
            />
          </div>
          <div className="actions">
            <button className="danger-action" type="submit" disabled={!matches || deletePending}>
              {deletePending ? "Deleting…" : "Permanently delete"}
            </button>
            <button className="secondary-action" type="button" onClick={onClose}>
              Keep class
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ClassSection({
  title,
  classes,
  timeZone,
  setStatusAction,
  duplicateAction,
  onDelete,
}: {
  title: string;
  classes: AdminClass[];
  timeZone: string;
  setStatusAction: Action;
  duplicateAction: Action;
  onDelete: (classItem: AdminClass, opener: HTMLButtonElement) => void;
}) {
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <section className="admin-class-section" role="region" aria-labelledby={id}>
      <div className="admin-class-section__header">
        <h2 id={id}>{title}</h2>
        <p className="admin-class-section__count" aria-hidden="true">
          {classes.length}
        </p>
      </div>
      {classes.length === 0 ? (
        <p className="empty-state">No classes in this section.</p>
      ) : (
        <ul className="admin-class-list">
          {classes.map((classItem) => (
            <ClassRow
              key={classItem.id}
              classItem={classItem}
              timeZone={timeZone}
              setStatusAction={setStatusAction}
              duplicateAction={duplicateAction}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminClassList({
  classes,
  timeZone,
  now,
  setStatusAction,
  duplicateAction,
  deleteAction,
}: {
  classes: AdminClass[];
  timeZone: string;
  now?: string;
  setStatusAction: Action;
  duplicateAction: Action;
  deleteAction: Action;
}) {
  const [deleteTarget, setDeleteTarget] = useState<AdminClass | null>(null);
  const [search, setSearch] = useState("");
  const deleteOpenerRef = useRef<HTMLButtonElement | null>(null);
  const nowMs = Date.parse(now ?? new Date().toISOString());
  const { upcoming, past } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = query
      ? classes.filter(
          (classItem) =>
            classItem.title.toLowerCase().includes(query) ||
            classItem.teacher_name.toLowerCase().includes(query),
        )
      : classes;
    const upcomingClasses = visible
      .filter((classItem) => Date.parse(classItem.starts_at) >= nowMs)
      .sort(byStartAscending);
    const pastClasses = visible
      .filter((classItem) => Date.parse(classItem.starts_at) < nowMs)
      .sort((left, right) => byStartAscending(right, left));
    return { upcoming: upcomingClasses, past: pastClasses };
  }, [classes, nowMs, search]);
  const openDeleteDialog = (classItem: AdminClass, opener: HTMLButtonElement) => {
    deleteOpenerRef.current = opener;
    setDeleteTarget(classItem);
  };
  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    deleteOpenerRef.current?.focus();
  };

  return (
    <>
      <div className="field admin-class-search">
        <label htmlFor="class-search">Search classes</label>
        <input
          id="class-search"
          type="search"
          placeholder="Filter by title or teacher"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </div>
      <div className="admin-classes">
        <ClassSection
          title="Upcoming classes"
          classes={upcoming}
          timeZone={timeZone}
          setStatusAction={setStatusAction}
          duplicateAction={duplicateAction}
          onDelete={openDeleteDialog}
        />
        <ClassSection
          title="Recently past classes"
          classes={past}
          timeZone={timeZone}
          setStatusAction={setStatusAction}
          duplicateAction={duplicateAction}
          onDelete={openDeleteDialog}
        />
      </div>
      {deleteTarget ? (
        <DeleteDialog
          classItem={deleteTarget}
          deleteAction={deleteAction}
          onClose={closeDeleteDialog}
        />
      ) : null}
    </>
  );
}
