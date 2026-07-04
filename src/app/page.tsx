import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSchoolDisplayName } from "@/features/classes/queries";
import { PARENT_SESSION_COOKIE, verifyParentSession } from "@/features/parent-access/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "See what's next",
    body: "Every upcoming class, in your school's local time, on one simple schedule.",
  },
  {
    title: "Join in one tap",
    body: "Open the Zoom link the moment class starts — no digging through emails.",
  },
  {
    title: "Never miss a session",
    body: "Add classes to your own calendar or get a daily email reminder.",
  },
];

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  if (await verifyParentSession(token)) redirect("/calendar");

  const schoolName = await getSchoolDisplayName();

  return (
    <div className="landing-page">
      <div className="landing">
        <header className="landing__hero">
          <p className="eyebrow">Class Calendar</p>
          <h1>{schoolName ? `${schoolName} classes, all in one place.` : "Your classes, all in one place."}</h1>
          <p className="landing__lede">
            A simple home for {schoolName ?? "your school"}&rsquo;s online classes — see the schedule,
            join on Zoom, and keep track of what&rsquo;s coming up.
          </p>
          <div className="landing__actions">
            <Link className="primary-action" href="/access">
              Parent access
            </Link>
            <Link className="secondary-action" href="/admin/login">
              Administrator sign in
            </Link>
          </div>
          <p className="landing__hint">Parents need the access code shared by the school.</p>
        </header>

        <ul className="landing__features">
          {FEATURES.map((feature) => (
            <li className="landing__feature" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
