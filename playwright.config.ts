import { defineConfig, devices } from "@playwright/test";

// A dedicated port so E2E never silently reuses another app (or the Docker
// container) that happens to be listening on 3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// E2E specs arrive in Phase 4 (geolocation scenarios).
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
