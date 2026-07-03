import Link from "next/link";

import { requireAdmin } from "@/features/admin/auth";
import { createClass } from "@/features/classes/admin-actions";
import { ClassForm } from "@/features/classes/class-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewClassPage() {
  await requireAdmin();

  return (
    <section className="admin-page admin-page--narrow">
      <p className="eyebrow">Administrator</p>
      <h1>New class</h1>
      <p className="intro">Times are entered in the school’s configured local time zone.</p>
      <ClassForm action={createClass} submitLabel="Create class" />
      <p className="back-link">
        <Link href="/admin/classes">Back to classes</Link>
      </p>
    </section>
  );
}
