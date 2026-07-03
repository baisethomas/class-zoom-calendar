import Link from "next/link";

import { requireAdmin } from "@/features/admin/auth";
import { importClasses } from "@/features/classes/admin-actions";
import { ImportClassesForm } from "@/features/classes/import-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ImportClassesPage() {
  await requireAdmin();

  return (
    <section className="admin-page admin-page--narrow">
      <p className="eyebrow">Administrator</p>
      <h1>Import classes</h1>
      <p className="intro">
        Bulk-add classes from a CSV file or pasted rows. Times are interpreted in the school’s
        configured time zone.
      </p>
      <ImportClassesForm action={importClasses} />
      <p className="back-link">
        <Link href="/admin/classes">Back to classes</Link>
      </p>
    </section>
  );
}
