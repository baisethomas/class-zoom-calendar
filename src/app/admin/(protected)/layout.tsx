import Link from "next/link";

import { AdminNavLinks } from "@/features/admin/admin-nav-links";
import { logoutAdmin, requireAdmin } from "@/features/admin/auth";
import { LogoutForm } from "@/features/admin/logout-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link href="/admin">Class Calendar · Admin</Link>
        <AdminNavLinks />
        <LogoutForm action={logoutAdmin} />
      </header>
      <main id="main-content" className="admin-main">{children}</main>
    </div>
  );
}
