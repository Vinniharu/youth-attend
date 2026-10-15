"use client";

import { Expand, X } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import { ChurchMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";

// Full-screen check-in code for the church screen. The code is fixed for the whole
// service (a shared photo is stopped by the geofence, not by time). It polls every
// 15 s for the live count, and to pick up a new code if a leader resets it.

const POLL_MS = 15_000;

type TokenResponse = {
  url: string;
  status: "scheduled" | "open" | "closed" | "processed" | "cancelled";
  checkedIn: number;
};

type Props = { sessionId: string; title: string; backHref: string };

export function QrDisplay({ sessionId, title, backHref }: Props) {
  const [data, setData] = useState<TokenResponse | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/qr-token`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as TokenResponse;
      setData(next);
      setSvg(
        await QRCode.toString(next.url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }),
      );
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  // Keep the projector laptop awake while the code is showing.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        // not supported or not allowed: the screen may sleep
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  const open = data?.status === "open";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <span className="flex items-center gap-3">
          <ChurchMark size={44} />
          <span className="font-heading text-2xl font-semibold tracking-tight">Pulse</span>
        </span>
        <span className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            <Expand aria-hidden />
            Full screen
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <X aria-hidden />
              Close
            </Link>
          </Button>
        </span>
      </header>

      <main className="grid flex-1 items-center gap-10 px-6 pb-10 sm:px-10 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div className="space-y-6">
          <p className="flex items-center gap-2.5 text-lg font-medium">
            <StatusDot tone={open ? "live" : "idle"} pulsing={open} />
            {open ? "Check-in is open" : "Check-in isn't open yet"}
          </p>
          <h1 className="text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] font-semibold">
            Scan to
            <br />
            check in
          </h1>
          <p className="max-w-md text-xl text-muted-foreground">
            Location not working? Point your phone&apos;s camera at the code. It only works here at
            church.
          </p>
          <p className="tabular text-xl">
            <span className="font-heading text-5xl font-semibold">{data?.checkedIn ?? "—"}</span>{" "}
            <span className="text-muted-foreground">checked in for {title}</span>
          </p>
        </div>

        <div className="mx-auto flex flex-col items-center gap-5">
          <div className="relative rounded-[2rem] bg-white p-5 shadow-lg">
            {svg ? (
              <div
                data-qr-url={data?.url}
                className="size-[min(70vw,60vh)] [&>svg]:size-full"
                // Generated locally by the qrcode library from our own URL.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="size-[min(70vw,60vh)] animate-pulse rounded-xl bg-muted" />
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Can&apos;t reach Pulse. The code will refresh when the connection is back.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
