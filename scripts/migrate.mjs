// Applies pending Drizzle migrations. Plain Node (no TS) so it runs in the slim
// Docker `migrator` stage: `node scripts/migrate.mjs` (env from the environment).
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const migrationsFolder = fileURLToPath(new URL("../src/db/migrations", import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
  console.log("[migrate] database is up to date");
} catch (error) {
  console.error("[migrate] failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
