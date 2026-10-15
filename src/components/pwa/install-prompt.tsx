"use client";

import { Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { ChurchMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Chrome/Edge/Samsung Internet fire `beforeinstallprompt` once the app is
// installable; we hold on to it and show our own button. iOS has no such event, so
// iPhone and iPad users get the Share → Add to Home Screen steps instead.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SNOOZE_KEY = "pulse:install-snoozed-until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false; // storage blocked (private mode): just show the prompt
  }
}

type Mode =
  { kind: "hidden" } | { kind: "android"; event: BeforeInstallPromptEvent } | { kind: "ios" };

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>({ kind: "hidden" });

  useEffect(() => {
    if (isStandalone() || isSnoozed()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault(); // keep Chrome's mini-infobar quiet; we show our own card
      setMode({ kind: "android", event: event as BeforeInstallPromptEvent });
    };
    const onInstalled = () => setMode({ kind: "hidden" });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Deferred so the state update doesn't happen synchronously inside the effect.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) timer = setTimeout(() => setMode({ kind: "ios" }), 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode.kind === "hidden") return null;

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // storage blocked: hide for this visit only
    }
    setMode({ kind: "hidden" });
  };

  const install = async () => {
    if (mode.kind !== "android") return;
    // The event can only be used once (a double tap makes prompt() throw), so the
    // card hides whatever happens; Chrome fires a fresh event later if dismissed.
    try {
      await mode.event.prompt();
      const { outcome } = await mode.event.userChoice;
      if (outcome === "dismissed") snooze();
    } catch {
      // already used or blocked: nothing to do
    } finally {
      setMode({ kind: "hidden" });
    }
  };

  return (
    <aside
      aria-label="Install Pulse"
      className="flex w-full max-w-md gap-4 rounded-2xl border bg-card p-5 shadow-sm"
    >
      <ChurchMark size={44} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Add Pulse to your home screen</h2>
          {mode.kind === "android" ? (
            <p className="text-sm text-muted-foreground">
              Open it like any other app on Sunday, one tap and you&apos;re counted.
            </p>
          ) : (
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Share className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Tap <span className="font-medium text-foreground">Share</span> in your
                  browser&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Choose <span className="font-medium text-foreground">Add to Home Screen</span>.
                </span>
              </li>
            </ol>
          )}
        </div>
        <div className="flex gap-2">
          {mode.kind === "android" && (
            <Button onClick={() => void install()} className="h-10 rounded-xl px-4">
              Install
            </Button>
          )}
          <Button variant="ghost" onClick={snooze} className="h-10 rounded-xl px-3">
            Not now
          </Button>
        </div>
      </div>
    </aside>
  );
}
