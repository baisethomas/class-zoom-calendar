import { loginAdmin } from "@/features/admin/auth";
import { LoginForm } from "@/features/admin/login-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLoginPage() {
  return (
    <main id="main-content" className="access-page">
      <section className="access-card" aria-labelledby="admin-login-title">
        <p className="eyebrow">Administrator</p>
        <h1 id="admin-login-title">Sign in</h1>
        <p className="intro">Manage the class calendar and family access settings.</p>
        <LoginForm action={loginAdmin} />
      </section>
    </main>
  );
}
