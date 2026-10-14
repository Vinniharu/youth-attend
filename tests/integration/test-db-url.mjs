/**
 * The integration-test database: DATABASE_URL with `_test` appended to the
 * database name, so tests can never touch the dev data.
 * Plain .mjs so the Vitest config can import it natively.
 *
 * @param {string | undefined} [base]
 * @returns {string}
 */
export function testDatabaseUrl(base = process.env.DATABASE_URL) {
  const url = new URL(base ?? "postgres://church@localhost:5432/attendance");
  url.pathname = `/${url.pathname.replace(/^\//, "").replace(/_test$/, "")}_test`;
  return url.toString();
}
