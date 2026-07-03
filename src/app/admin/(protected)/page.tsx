import Link from "next/link";

export default function AdminPage() {
  return (
    <section className="home">
      <p className="eyebrow">Administrator</p>
      <h1>Calendar administration</h1>
      <p className="intro">
        Keep the weekly schedule accurate, update the family access settings, and share calendar
        tools with the rest of your school team.
      </p>
      <div className="dashboard-grid" aria-label="Administrator shortcuts">
        <article className="dashboard-card">
          <p className="eyebrow">Schedule</p>
          <h2>Classes</h2>
          <p>Create, edit, import, cancel, restore, or duplicate Zoom classes.</p>
          <Link className="primary-action" href="/admin/classes">Open classes</Link>
        </article>
        <article className="dashboard-card">
          <p className="eyebrow">Configuration</p>
          <h2>Settings</h2>
          <p>Manage the school name, parent access code, feed link, and administrators.</p>
          <Link className="secondary-action" href="/admin/settings">Open settings</Link>
        </article>
      </div>
    </section>
  );
}
