import "server-only";
import { db } from "@/server/db";

export type SubscribeResult = "created" | "already-subscribed" | "resubscribed";

/**
 * Adds an email to the list, or reactivates a previously unsubscribed
 * address. An existing ACTIVE subscriber is a no-op so the footer form can be
 * submitted twice without error.
 */
export async function subscribe(
  email: string,
  source: string | null
): Promise<SubscribeResult> {
  const existing = await db.subscriber.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  if (!existing) {
    await db.subscriber.create({ data: { email, source } });
    return "created";
  }

  if (existing.status === "ACTIVE") return "already-subscribed";

  await db.subscriber.update({
    where: { id: existing.id },
    data: { status: "ACTIVE", unsubscribedAt: null, source },
  });
  return "resubscribed";
}

export async function countActiveSubscribers(): Promise<number> {
  return db.subscriber.count({ where: { status: "ACTIVE" } });
}
