import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

import { e2eDatabaseUrl } from "./tests/e2e/db";

loadEnv({ quiet: true });

// A dedicated port so E2E never silently reuses another app (or the Docker
// container) that happens to be listening on 3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Specs share one database and one open session; run them in order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      // E2E_CHANNEL=chrome runs the installed Chrome instead of Playwright's Chromium.
      use: { ...devices["Pixel 7"], channel: process.env.E2E_CHANNEL || undefined },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // A production build, not `next dev`: Next 16 allows only one dev server per
        // project, so `next dev` here would fail whenever `npm run dev` is running.
        // It also tests what actually ships.
        command: `npm run build && npx next start --port ${PORT}`,
        // Not /api/health: Playwright starts the server before globalSetup creates the
        // e2e database, so health would fail until then. /login needs no database.
        url: `${baseURL}/login`,
        timeout: 600_000,
        // Never reuse a server: one already on this port may point at the dev database.
        reuseExistingServer: false,
        env: {
          DATABASE_URL: e2eDatabaseUrl(),
          BETTER_AUTH_URL: baseURL,
          APP_URL: baseURL,
          // Production refuses to issue codes without email config. Specs sign in by
          // planting a code and calling the sign-in endpoint, so nothing is ever sent.
          RESEND_API_KEY: "e2e-unused",
        },
      },
});
