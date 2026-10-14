// drizzle-kit quotes custom column types, emitting "geography(Point, 4326)",
// which Postgres reads as a type literally named that. Runs after every
// `npm run db:generate` and unquotes it in all migration files.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../src/db/migrations", import.meta.url));
const QUOTED = /"(geography\([^)]*\))"/g;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
  const path = `${dir}/${file}`;
  const sql = readFileSync(path, "utf8");
  const fixed = sql.replace(QUOTED, "$1");
  if (fixed !== sql) {
    writeFileSync(path, fixed);
    console.log(`[fix-migrations] unquoted geography type in ${file}`);
  }
}
