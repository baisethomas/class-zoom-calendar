// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { EmailMessage } from "@/features/reminders/email";
import { sendReminderDigest } from "@/features/reminders/send";
import type { createAdminClient } from "@/lib/supabase/admin";

const NOW = new Date("2026-07-01T16:00:00.000Z");
const ORIGIN = "https://calendar.example.org";

function reminderClient({
  subscribers = [{ email: "parent@example.org", unsubscribe_token: "t".repeat(43) }],
  classes = [
    {
      title: "Algebra I",
      teacher_name: "Ada Lovelace",
      starts_at: "2026-07-01T23:00:00.000Z",
      ends_at: "2026-07-02T00:00:00.000Z",
      zoom_url: "https://school.zoom.us/j/123",
      status: "scheduled",
    },
  ],
  alreadyClaimed = false,
}: {
  subscribers?: Array<{ email: string; unsubscribe_token: string }>;
  classes?: unknown[];
  alreadyClaimed?: boolean;
} = {}) {
  const upserts: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === "school_settings") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single() {
            return Promise.resolve({
              data: { display_name: "Sunrise School", timezone: "America/Los_Angeles" },
              error: null,
            });
          },
        };
      }
      if (table === "reminder_subscriptions") {
        return {
          select() {
            return Promise.resolve({ data: subscribers, error: null });
          },
        };
      }
      if (table === "reminder_digests") {
        return {
          upsert(payload: unknown) {
            upserts.push(payload);
            return {
              select() {
                return Promise.resolve({
                  data: alreadyClaimed ? [] : [payload],
                  error: null,
                });
              },
            };
          },
        };
      }
      return {
        select() {
          return this;
        },
        gte() {
          return this;
        },
        lt() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({ data: classes, error: null });
        },
      };
    },
  };
  return { client: client as unknown as ReturnType<typeof createAdminClient>, upserts };
}

describe("sendReminderDigest", () => {
  it("sends one digest email per subscriber", async () => {
    const { client, upserts } = reminderClient({
      subscribers: [
        { email: "one@example.org", unsubscribe_token: "a".repeat(43) },
        { email: "two@example.org", unsubscribe_token: "b".repeat(43) },
      ],
    });
    const deliver = vi.fn<(message: EmailMessage) => Promise<{ sent: true }>>(async () => ({
      sent: true,
    }));

    const result = await sendReminderDigest({ now: NOW, origin: ORIGIN }, { client, deliver });

    expect(result).toEqual({ status: "sent", subscribers: 2, classes: 1, failures: 0 });
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[0]![0]).toMatchObject({ to: "one@example.org" });
    const message = deliver.mock.calls[0]![0];
    expect(message.text).toContain(`${ORIGIN}/api/reminder-unsubscribe?token=${"a".repeat(43)}`);
    // Digest claimed under the school-local date (09:00 local on 2026-07-01).
    expect(upserts).toEqual([{ digest_date: "2026-07-01" }]);
  });

  it("skips without sending when the digest was already sent today", async () => {
    const { client } = reminderClient({ alreadyClaimed: true });
    const deliver = vi.fn(async () => ({ sent: true as const }));

    const result = await sendReminderDigest({ now: NOW, origin: ORIGIN }, { client, deliver });

    expect(result).toEqual({ status: "skipped", reason: "already sent today" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("skips when there are no subscribers", async () => {
    const { client } = reminderClient({ subscribers: [] });
    const deliver = vi.fn(async () => ({ sent: true as const }));

    const result = await sendReminderDigest({ now: NOW, origin: ORIGIN }, { client, deliver });

    expect(result).toEqual({ status: "skipped", reason: "no subscribers" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("skips when no classes start in the next 24 hours", async () => {
    const { client } = reminderClient({ classes: [] });
    const deliver = vi.fn(async () => ({ sent: true as const }));

    const result = await sendReminderDigest({ now: NOW, origin: ORIGIN }, { client, deliver });

    expect(result).toEqual({ status: "skipped", reason: "no upcoming classes" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("counts delivery failures without aborting the run", async () => {
    const { client } = reminderClient({
      subscribers: [
        { email: "one@example.org", unsubscribe_token: "a".repeat(43) },
        { email: "two@example.org", unsubscribe_token: "b".repeat(43) },
      ],
    });
    const deliver = vi
      .fn()
      .mockResolvedValueOnce({ sent: false, reason: "provider status 500" })
      .mockResolvedValueOnce({ sent: true });

    const result = await sendReminderDigest({ now: NOW, origin: ORIGIN }, { client, deliver });

    expect(result).toEqual({ status: "sent", subscribers: 2, classes: 1, failures: 1 });
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
