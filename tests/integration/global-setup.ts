import { execFileSync } from "node:child_process";

import pg from "pg";

import { testDatabaseUrl } from "./test-db-url.mjs";

/** Creates the `_test` database if needed and applies every migration to it. */
export default async function setup() {
  // globalSetup runs in the main process, where test.env is not applied.
  const testUrl = testDatabaseUrl();
  const testDb = new URL(testUrl).pathname.slice(1);

  // Connect to the maintenance DB to create the test DB.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.end();
  }

  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
