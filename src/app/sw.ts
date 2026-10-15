/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

// Pulse service worker. Bundled into public/sw.js by scripts/build-sw.mjs after
// `next build`, with the precache list injected as self.__SW_MANIFEST.
//
// Caching is deliberately narrow: pages and /api are never cached, because they're
// per-member and time-sensitive (an offline "Service open" or another account's
// page would be wrong). Only content-hashed static files, images and icons are.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Content-hashed build output: safe to serve from cache forever.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "static",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * DAY })],
      }),
    },
    {
      // Optimised images (the RCCG badge) and app icons.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname === "/_next/image" ||
          url.pathname.startsWith("/icons/") ||
          /^\/(icon|apple-icon)\.png$|^\/favicon\.ico$/.test(url.pathname)),
      handler: new StaleWhileRevalidate({
        cacheName: "images",
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * DAY })],
      }),
    },
    {
      // Pages always come from the network; when that fails, the offline page below.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
