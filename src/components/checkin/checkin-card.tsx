"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import {
  readPosition,
  REQUEST_TIMEOUT_MS,
  submitCheckin,
  ViewBody,
  type View,
} from "@/components/checkin/checkin-views";
import type { MemberStatus } from "@/lib/checkin-types";

// Auto check-in runs on load and when the app returns to the foreground. The server
// allows 5 attempts per 5 minutes, so foreground retries wait at least this long.
const FOREGROUND_RETRY_MS = 45_000;

function initialView(status: MemberStatus): View {
  if (!status.current) return { kind: "no-service", next: status.next };
  if (status.current.checkIn)
    return { kind: "checked-in", checkedInAt: status.current.checkIn.checkedInAt };
  return { kind: "locating" };
}

type Props = { initial: MemberStatus; timeZone: string };

export function CheckinCard({ initial, timeZone }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [view, setView] = useState<View>(() => initialView(initial));
  const inFlight = useRef(false);
  const lastAttempt = useRef(0);

  const checkIn = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastAttempt.current = Date.now();
    try {
      setView({ kind: "locating" });
      const reading = await readPosition();
      if (reading === "denied" || reading === "unavailable") {
        setView({ kind: reading });
        return;
      }

      setView({ kind: "checking" });
      const next = await submitCheckin("/api/checkin/geofence", reading);
      if (next === "unauthenticated") return router.replace("/login");
      if (next.kind === "no-service") {
        // The service closed (or was closed) since the page loaded.
        const fresh = await fetchStatus();
        if (fresh) setStatus(fresh);
        return setView({ kind: "no-service", next: fresh?.next ?? null });
      }
      setView(next);
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  // Check in automatically when a service is open and I haven't checked in yet.
  useEffect(() => {
    if (initial.current && !initial.current.checkIn) void checkIn();
  }, [initial, checkIn]);

  // Coming back to the app (e.g. arriving at church with it already open): refresh
  // the status, and try again if a service is open and I'm not checked in yet.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      const fresh = await fetchStatus();
      // A check-in may have started while the status was loading; it owns the view.
      if (!fresh || inFlight.current) return;
      setStatus(fresh);
      if (!fresh.current) return setView({ kind: "no-service", next: fresh.next });
      if (fresh.current.checkIn) {
        return setView({ kind: "checked-in", checkedInAt: fresh.current.checkIn.checkedInAt });
      }
      if (Date.now() - lastAttempt.current >= FOREGROUND_RETRY_MS) void checkIn();
      // Too soon to retry automatically: show the open service with a button.
      else setView((v) => (v.kind === "no-service" ? { kind: "ready" } : v));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkIn]);

  const open = status.current !== null;

  return (
    <section
      aria-label="Sunday check-in"
      className="w-full max-w-md rounded-[2rem] border bg-card p-6 shadow-lg sm:p-7"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <StatusDot tone={open ? "live" : "idle"} />
        {open ? "Service open" : "No service right now"}
      </p>

      <div aria-live="polite" className="mt-7">
        <ViewBody view={view} timeZone={timeZone} onRetry={() => void checkIn()} />
      </div>
    </section>
  );
}

async function fetchStatus(): Promise<MemberStatus | null> {
  try {
    const response = await fetch("/api/sessions/current", {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as MemberStatus) : null;
  } catch {
    return null;
  }
}
