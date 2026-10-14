/**
 * DEV ONLY. Wipes the database, re-applies every migration and re-seeds.
 *
 *   npm run db:reset
 *
 * Drops the `drizzle` schema too: it holds the migration journal, and leaving it
 * would make the migrator think everything is already applied.
 */
import { execFileSync } from "node:child_process";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "@/db/client";

import { assertLocalDatabase } from "./guard";

assertLocalDatabase("reset");

async function main() {
  const db = getDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await closeDb();
  console.log("[reset] schemas dropped");

  const run = (script: string) =>
    execFileSync(process.execPath, script.split(" "), { stdio: "inherit", env: process.env });
  run("scripts/migrate.mjs");
  run("--import tsx scripts/seed.ts");
}

main().catch(async (error) => {
  console.error("[reset] failed", error);
  await closeDb();
  process.exitCode = 1;
});
