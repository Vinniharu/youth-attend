import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { ProfileInput } from "@/lib/schemas";

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

export async function getProfile(userId: string): Promise<{ name: string; phone: string }> {
  const [row] = await getDb()
    .select({ name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { name: row?.name ?? "", phone: row?.phone ?? "" };
}

/** A member's own name and phone. Only ever called with the signed-in user's id. */
export async function updateOwnProfile(userId: string, profile: ProfileInput): Promise<void> {
  await getDb()
    .update(users)
    .set({ name: profile.name, phone: profile.phone || null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
