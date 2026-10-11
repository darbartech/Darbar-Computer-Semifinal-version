import "server-only";
import { db } from "@/server/db";

/** Stores a public contact-form message. */
export async function createContactMessage(data: {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  organization: string | null;
  message: string;
  ipHash: string;
}) {
  return db.contactMessage.create({ data });
}

export async function countUnreadMessages(): Promise<number> {
  return db.contactMessage.count({ where: { status: "NEW" } });
}
