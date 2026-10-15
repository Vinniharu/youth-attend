import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export async function getEmailNotifications(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ emailNotifications: users.emailNotifications })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.emailNotifications ?? false;
}

export async function setEmailNotifications(userId: string, enabled: boolean): Promise<void> {
  await getDb().update(users).set({ emailNotifications: enabled }).where(eq(users.id, userId));
}
