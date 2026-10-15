import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { ThemeProvider } from "next-themes";

import { SessionKeepAlive } from "@/components/auth/session-keep-alive";
import { DevServiceWorkerReset } from "@/components/pwa/dev-service-worker-reset";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headings only: modern character, used sparingly.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: "Pulse",
  title: {
    default: "Pulse",
    template: "%s · Pulse",
  },
  description: "Sunday check-in for youth church. Open the app when you arrive and you're counted.",
  // iPhone "Add to Home Screen": opens full-screen with this name under the icon
  // (src/app/apple-icon.png).
  appleWebApp: { capable: true, title: "Pulse", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Service worker (public/sw.js, built by scripts/build-sw.mjs): production
              only, since in dev it would fight hot reload. Pages are never cached on
              navigation; see src/app/sw.ts. */}
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV !== "production"}
            cacheOnNavigation={false}
            // Not app-wide: it would throw away a half-typed code or unsaved form when
            // a flaky connection returns. The offline page reloads itself instead.
            reloadOnOnline={false}
          >
            {children}
          </SerwistProvider>
          <Toaster />
          <SessionKeepAlive />
          {process.env.NODE_ENV !== "production" && <DevServiceWorkerReset />}
        </ThemeProvider>
      </body>
    </html>
  );
}
