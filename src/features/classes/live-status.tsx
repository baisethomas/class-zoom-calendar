"use client";

import { useSyncExternalStore } from "react";

const SOON_WINDOW_MS = 60 * 60 * 1000;
const JOIN_EARLY_MS = 10 * 60 * 1000;
const TICK_MS = 30 * 1000;

export type ClassLiveState = "upcoming" | "soon" | "live" | "ended";

export function classLiveState(startsAt: string, endsAt: string, nowMs: number): ClassLiveState {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "upcoming";
  if (nowMs >= end) return "ended";
  if (nowMs >= start - JOIN_EARLY_MS) return "live";
  if (nowMs >= start - SOON_WINDOW_MS) return "soon";
  return "upcoming";
}

function subscribeToClock(onTick: () => void): () => void {
  const id = setInterval(onTick, TICK_MS);
  return () => clearInterval(id);
}

/**
 * Returns null during server rendering so the markup never depends on the
 * clock, then ticks every 30 seconds. The snapshot is quantized to the tick
 * interval so re-renders only happen when the clock advances a tick.
 */
function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => null,
  );
}

export function LiveBadge({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useNow();
  if (now === null) return null;

  const state = classLiveState(startsAt, endsAt, now);
  if (state === "live") {
    return <span className="status-pill status-pill--live">Happening now</span>;
  }
  if (state === "soon") {
    const minutes = Math.max(1, Math.round((Date.parse(startsAt) - now) / 60000));
    return <span className="status-pill status-pill--soon">Starts in {minutes} min</span>;
  }
  return null;
}

export function JoinAction({
  href,
  title,
  startsAt,
  endsAt,
}: {
  href: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const now = useNow();
  const live = now !== null && classLiveState(startsAt, endsAt, now) === "live";

  return (
    <a
      className={`join-action${live ? " join-action--live" : ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Join ${title} on Zoom (opens in a new tab)`}
    >
      {live ? "Join now" : "Join on Zoom"}
    </a>
  );
}
