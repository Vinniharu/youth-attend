import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Deliberately no `server-only` import: seed scripts (tsx) and Vitest integration
// tests import this module from plain Node. Never import it from client components.

type Db = NodePgDatabase;

// Stored on globalThis so dev hot reloads reuse one pool instead of leaking new ones.
const globalForDb = globalThis as unknown as { db?: Db };

/**
 * Returns the shared Drizzle instance, creating the pool on first use. Lazy so
 * `next build` (which imports route modules without a database) needs no DATABASE_URL.
 */
export function getDb(): Db {
  if (globalForDb.db) return globalForDb.db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    // Fail fast instead of hanging when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  // Without a listener, an error on an idle client (e.g. the DB restarts) is an
  // uncaught exception that kills the server. The pool discards the client itself.
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  globalForDb.db = drizzle({ client: pool });
  return globalForDb.db;
}
