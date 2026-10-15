import { sql } from "drizzle-orm";

import { users } from "./schema";

/**
 * A member's name for leader-facing lists, or their email if they haven't added a
 * name yet (a self-registered account before /welcome).
 */
export const displayName = sql<string>`coalesce(nullif(btrim(${users.name}), ''), ${users.email}::text)`;
