import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      // Needs the Docker database: `docker compose up -d db`.
      {
        extends: true,
        test: { name: "integration", include: ["tests/integration/**/*.test.ts"] },
      },
    ],
  },
});
