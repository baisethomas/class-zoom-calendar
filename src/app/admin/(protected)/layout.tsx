import Link from "next/link";

import { logoutAdmin, requireAdmin } from "@/features/admin/auth";
import { LogoutForm } from "@/features/admin/logout-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link href="/admin">Admin</Link>
        <nav aria-label="Administrator">
          <Link href="/admin/classes">Classes</Link>
          <Link href="/admin/settings">Settings</Link>
        </nav>
        <LogoutForm action={logoutAdmin} />
      </header>
      <main id="main-content" className="admin-main">{children}</main>
    </div>
  );
}
