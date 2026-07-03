import Link from "next/link";

export default function AdminPage() {
  return (
    <section className="home">
      <p className="eyebrow">Administrator</p>
      <h1>Calendar administration</h1>
      <p className="intro">Choose an area to manage.</p>
      <div className="actions">
        <Link className="primary-action" href="/admin/classes">Classes</Link>
        <Link className="secondary-action" href="/admin/settings">Settings</Link>
      </div>
    </section>
  );
}
