/**
 * Bundles the one-shot migrator, the cron scheduler and create-admin into self-contained files
 * (all dependencies inlined) in .tools/, so their Docker images need no
 * node_modules: a bare node:22-alpine plus one file each (and the migrations).
 *
 *   node scripts/bundle-tools.mjs
 */
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: false,
  legalComments: "none",
  // pg loads its optional native binding inside a try/catch; we use the JS client.
  external: ["pg-native"],
  // Bundled CommonJS dependencies (pg) call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "warning",
};

await Promise.all([
  // Keeps the scripts/ location so migrate.mjs still finds ../src/db/migrations.
  build({ ...shared, entryPoints: ["scripts/migrate.mjs"], outfile: ".tools/scripts/migrate.mjs" }),
  build({
    ...shared,
    entryPoints: ["scripts/scheduler.mjs"],
    outfile: ".tools/scripts/scheduler.mjs",
  }),
  build({
    ...shared,
    entryPoints: ["scripts/create-admin.mjs"],
    outfile: ".tools/scripts/create-admin.mjs",
  }),
]);
console.log("[tools] bundled .tools/scripts/{migrate,scheduler,create-admin}.mjs");
