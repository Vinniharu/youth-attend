/**
 * Creates (or promotes) a leader account in production, where the demo seed must
 * never run. Bundled into the migrator image:
 *
 *   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
 *     run --rm migrate node scripts/create-admin.mjs "Ada Okoro" ada@church.org
 *
 * They then sign in at /login with a code sent to that email.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";

const [name, email] = process.argv.slice(2);
if (!name?.trim() || !email?.includes("@")) {
  console.error('usage: node scripts/create-admin.mjs "Full Name" email@example.org');
  process.exit(2);
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[create-admin] DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query(
    `INSERT INTO users (id, name, email, role, email_verified)
     VALUES ($1, $2, lower($3), 'admin', false)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = true
     RETURNING (xmax = 0) AS created`,
    [randomUUID(), name.trim(), email.trim()],
  );
  console.log(
    rows[0]?.created
      ? `[create-admin] created leader ${email}`
      : `[create-admin] ${email} already existed; now a leader`,
  );
} finally {
  await client.end();
}
