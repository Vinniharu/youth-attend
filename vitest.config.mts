import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./tests/integration/test-db-url.mjs";

loadEnv({ quiet: true });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
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
          env: { DATABASE_URL: testDatabaseUrl() },
          // Test files share one database; run them one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
