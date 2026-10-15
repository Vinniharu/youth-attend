/**
 * Builds the service worker after `next build` (it's part of `npm run build`):
 * computes the precache list from the fresh build output, then bundles
 * src/app/sw.ts into public/sw.js with that list injected.
 *
 * Why not Serwist's Turbopack route handler? With cacheComponents its
 * `force-static` export is rejected, so the route would bundle the worker at
 * runtime, and the standalone Docker image has no source files or esbuild to do it.
 * A file in public/ is served as-is, at the root scope, with nothing to run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { getManifest } from "@serwist/build";
import { build } from "esbuild";

const SW_SOURCE = "src/app/sw.ts";
const SW_OUTPUT = "public/sw.js";

// Changes on every build, so phones re-fetch the offline page (whose HTML points at
// that build's hashed CSS).
const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();

const { manifestEntries, count, size, warnings } = await getManifest({
  globDirectory: ".",
  // Only what the offline page needs (CSS and the preloaded latin fonts, marked
  // `-s.p.` by next/font) and the install icons. Scripts, images and other fonts are
  // cached at runtime as they're used, so a first visit on mobile data doesn't
  // download the whole app.
  globPatterns: [".next/static/**/*.css", ".next/static/media/*-s.p.*.woff2", "public/icons/*.png"],
  // Hashed build files don't need a revision query.
  dontCacheBustURLsMatching: /^\.next\/static\//,
  additionalPrecacheEntries: [{ url: "/offline", revision: buildId }],
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.map((entry) => ({
        ...entry,
        url: entry.url.startsWith(".next/")
          ? `/_next/${entry.url.slice(".next/".length)}`
          : entry.url.startsWith("public/")
            ? `/${entry.url.slice("public/".length)}`
            : entry.url,
      })),
      warnings: [],
    }),
  ],
});
for (const warning of warnings) console.warn(`[sw] ${warning}`);

await build({
  entryPoints: [SW_SOURCE],
  outfile: SW_OUTPUT,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  define: { "self.__SW_MANIFEST": JSON.stringify(manifestEntries) },
  legalComments: "none",
  logLevel: "warning",
});

const swSize = readFileSync(SW_OUTPUT).length;
const hash = createHash("sha256").update(readFileSync(SW_OUTPUT)).digest("hex").slice(0, 8);
console.log(
  `[sw] ${SW_OUTPUT} (${(swSize / 1024).toFixed(1)} KB, ${hash}): ` +
    `${count} precache entries (${(size / 1024).toFixed(1)} KB)`,
);
