import type { MetadataRoute } from "next";

// Install metadata: the name and RCCG icons shown when Pulse is added to a home
// screen. The service worker and offline page arrive in Phase 5.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pulse",
    short_name: "Pulse",
    description:
      "Sunday check-in for youth church. Open the app when you arrive and you're counted.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f7f9fc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
