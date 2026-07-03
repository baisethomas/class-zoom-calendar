"use client";

import { useState } from "react";

export function LogoutButton({
  navigate = (path) => window.location.assign(path),
}: {
  navigate?: (path: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logOut() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/parent-session", { method: "DELETE" });
      if (!response.ok) throw new Error("Session deletion failed");
      navigate("/access");
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="logout-button" type="button" onClick={logOut} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? <p className="logout-error" role="alert">{error}</p> : null}
    </div>
  );
}
