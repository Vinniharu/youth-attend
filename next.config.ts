import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// HSTS is set by Caddy (the HTTPS edge), not here: these headers are computed at
// build time, which knows nothing about the domain the app is served on.

/**
 * Content-Security-Policy without nonces (Next's "Without Nonces" guide): nonces
 * would force every page to render per request and lose the static shells that
 * make Pulse fast on phones. Still strict where it matters: scripts only from this
 * site (inline is Next's own bootstrap), no plugins or framing, and connections and
 * images limited to what Pulse uses (Nominatim search, OpenStreetMap tiles).
 */
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': the self-hosted QR decoder (zxing WebAssembly) on iPhones.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  `connect-src 'self' https://nominatim.openstreetmap.org${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Always revalidate the service worker so phones pick up a new build quickly.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
