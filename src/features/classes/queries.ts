import "server-only";

import { z } from "zod";

import { verifyParentSession } from "@/features/parent-access/session";
import { createAdminClient } from "@/lib/supabase/admin";

const CLASS_FIELDS =
  "id,title,description,teacher_name,starts_at,ends_at,zoom_url,status" as const;
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;
const rangeInstantSchema = z.iso.datetime({ offset: true });

export type ParentClass = {
  id: string;
  title: string;
  description: string | null;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  zoom_url: string;
  status: string;
};

export type SchoolCalendarSettings = {
  display_name: string;
  timezone: string;
};

function parseRangeInstant(value: string): number {
  if (!rangeInstantSchema.safeParse(value).success) return Number.NaN;
  return Date.parse(value);
}

export async function getParentClasses({
  from,
  to,
  sessionToken,
}: {
  from: string;
  to: string;
  sessionToken: string | undefined;
}): Promise<{ classes: ParentClass[]; school: SchoolCalendarSettings }> {
  const session = await verifyParentSession(sessionToken);
  if (!session) throw new Error("Unauthorized");

  const fromTime = parseRangeInstant(from);
  const toTime = parseRangeInstant(to);
  if (
    !Number.isFinite(fromTime) ||
    !Number.isFinite(toTime) ||
    toTime <= fromTime ||
    toTime - fromTime > MAX_RANGE_MS
  ) {
    throw new Error("Invalid calendar range");
  }

  const client = createAdminClient();
  const { data: classes, error: classesError } = await client
    .from("classes")
    .select(CLASS_FIELDS)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true });

  if (classesError || !classes) throw new Error("Unable to load calendar");

  const { data: school, error: schoolError } = await client
    .from("school_settings")
    .select("display_name,timezone")
    .eq("id", true)
    .single();

  if (schoolError || !school) throw new Error("Unable to load calendar");

  return { classes, school };
}

/**
 * Public, unauthenticated read of just the school display name for the landing
 * page. Runs server-side only; returns null on any failure so the landing
 * degrades to a generic title rather than erroring.
 */
export async function getSchoolDisplayName(): Promise<string | null> {
  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("school_settings")
      .select("display_name")
      .eq("id", true)
      .single();
    if (error || !data?.display_name) return null;
    return data.display_name;
  } catch {
    return null;
  }
}

export async function getNextParentClass({
  from,
  sessionToken,
}: {
  from: string;
  sessionToken: string | undefined;
}): Promise<ParentClass | null> {
  const session = await verifyParentSession(sessionToken);
  if (!session) throw new Error("Unauthorized");
  if (!Number.isFinite(parseRangeInstant(from))) throw new Error("Invalid calendar range");

  const client = createAdminClient();
  const { data, error } = await client
    .from("classes")
    .select(CLASS_FIELDS)
    .gte("starts_at", from)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Unable to load calendar");
  return data;
}
