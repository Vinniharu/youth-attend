"use client";

import { Expand, X } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import { ChurchMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";

// Full-screen rotating QR for the church screen. Polls the token every 10 s (and
// right after each window ends), so the code on screen is always current; a photo
// of it stops working within about a minute.

const POLL_MS = 10_000;

type TokenResponse = {
  url: string;
  expiresAt: string;
  windowSeconds: number;
  serverNow: string;
  status: "scheduled" | "open" | "closed" | "processed" | "cancelled";
  checkedIn: number;
};

type Props = { sessionId: string; title: string; backHref: string };

export function QrDisplay({ sessionId, title, backHref }: Props) {
  const [data, setData] = useState<TokenResponse | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Server clock minus ours, so the countdown matches the server's windows.
  const [skew, setSkew] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/qr-token`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as TokenResponse;
      setSkew(new Date(next.serverNow).getTime() - Date.now());
      setData(next);
      setSvg(
        await QRCode.toString(next.url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }),
      );
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  // Poll, and refetch as soon as the current window ends.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const msLeft = new Date(data.expiresAt).getTime() - (Date.now() + skew);
    const rotate = setTimeout(() => void load(), Math.max(0, msLeft) + 250);
    return () => clearTimeout(rotate);
  }, [data, skew, load]);

  // Countdown tick.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

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

  const secondsLeft = data
    ? Math.max(0, (new Date(data.expiresAt).getTime() - (now + skew)) / 1000)
    : 0;
  const fraction = data ? secondsLeft / data.windowSeconds : 0;
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
            Location not working? Point your phone&apos;s camera at the code. It changes every{" "}
            {data?.windowSeconds ?? 30} seconds.
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
          <Countdown fraction={fraction} seconds={Math.ceil(secondsLeft)} />
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

function Countdown({ fraction, seconds }: { fraction: number; seconds: number }) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  return (
    <span className="flex items-center gap-3 text-muted-foreground">
      <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-200 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="tabular text-lg">New code in {seconds}s</span>
    </span>
  );
}
