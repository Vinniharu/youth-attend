import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export type MemberCounts = { members: number; flagged: number };

/** Active members and how many of them are flagged for follow-up (one query). */
export async function getMemberCounts(): Promise<MemberCounts> {
  const [row] = await getDb()
    .select({
      members: count(),
      flagged: sql<number>`count(*) filter (where ${users.isFlagged})`.mapWith(Number),
    })
    .from(users)
    .where(and(eq(users.role, "member"), eq(users.isActive, true)));
  return { members: row?.members ?? 0, flagged: row?.flagged ?? 0 };
}
