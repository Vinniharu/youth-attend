import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { ReloadWhenOnline } from "@/components/pwa/reload-when-online";

export const metadata: Metadata = { title: "Offline" };

// Shown by the service worker when a page can't load without a connection. Static
// and public (no session needed), and precached at install with its CSS and fonts.
// It works without JavaScript: "Try again" is a plain link; with it, the page
// reloads itself when the connection returns.
export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      {/* Text only: the badge is an optimised image that may not be cached yet. */}
      <header className="font-heading text-xl font-semibold tracking-tight">Pulse</header>
      <ReloadWhenOnline />
      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <WifiOff className="size-7" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">You&apos;re offline</h1>
          <p className="text-muted-foreground">
            Pulse needs a connection to check you in. Turn on Wi-Fi or mobile data and it will pick
            up where you left off.
          </p>
        </div>
        {/* A full page load on purpose: <Link> would try a client-side fetch, which
            fails offline; a document request lets the service worker decide. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground"
        >
          Try again
        </a>
      </main>
    </div>
  );
}
