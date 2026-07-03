import { AccessForm } from "@/features/parent-access/access-form";
import { requestParentAccess } from "@/features/parent-access/actions";

export default function AccessPage() {
  return (
    <div className="access-page">
      <section className="access-card" aria-labelledby="access-title">
        <p className="eyebrow">Class Calendar</p>
        <h1 id="access-title">Welcome, families.</h1>
        <p className="intro">Enter the access code shared by your school to view upcoming classes.</p>
        <AccessForm action={requestParentAccess} />
      </section>
    </div>
  );
}
