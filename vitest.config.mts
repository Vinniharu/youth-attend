import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./tests/integration/test-db-url.mjs";

loadEnv({ quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside Next's react-server build; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          // Needs the Docker database: `docker compose up -d db`.
          globalSetup: ["tests/integration/global-setup.ts"],
          // A separate *_test database so tests never touch dev data.
          // No RESEND_API_KEY: tests must never send real email.
          env: { DATABASE_URL: testDatabaseUrl(), RESEND_API_KEY: "" },
          // Test files share one database; run them one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
