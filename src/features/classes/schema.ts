import { z } from "zod";

const classStatuses = ["scheduled", "canceled"] as const;

function trimmedTextSchema(minLength: number, maxLength: number) {
  return z
    .string()
    .trim()
    .refine((value) => {
      const length = Array.from(value).length;
      return length >= minLength && length <= maxLength;
    }, `Must contain between ${minLength} and ${maxLength} characters`);
}

const instantSchema = z
  .string()
  .trim()
  .pipe(z.iso.datetime({ offset: true }))
  .refine((value) => Number.isFinite(Date.parse(value)), "Must be a valid date and time")
  .transform((value) => new Date(value).toISOString());

export function isSafeZoomUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isZoomHost = url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us");

    return (
      url.protocol === "https:" &&
      isZoomHost &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const zoomUrlSchema = z
  .string()
  .trim()
  .refine(isSafeZoomUrl, "Must be a safe Zoom HTTPS URL")
  .transform((value) => new URL(value).toString());

export const classInputSchema = z
  .object({
    title: trimmedTextSchema(1, 120),
    description: trimmedTextSchema(0, 1000).optional(),
    teacherName: trimmedTextSchema(1, 120),
    startsAt: instantSchema,
    endsAt: instantSchema,
    zoomUrl: zoomUrlSchema,
    status: z.enum(classStatuses),
  })
  .refine((input) => Date.parse(input.endsAt) > Date.parse(input.startsAt), {
    message: "End time must be later than start time",
    path: ["endsAt"],
  });

export type ClassInput = z.infer<typeof classInputSchema>;
export type ClassStatus = (typeof classStatuses)[number];
