import { execFileSync } from "node:child_process";

import pg from "pg";

import { closeE2eDb, e2eDatabaseUrl, resetE2eData } from "./db";

/** Creates the `_e2e` database if needed, migrates it and seeds a fresh open session. */
export default async function globalSetup() {
  const url = e2eDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
  await resetE2eData();
  await closeE2eDb();
}
