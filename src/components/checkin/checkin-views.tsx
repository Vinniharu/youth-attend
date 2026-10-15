"use client";

import {
  CalendarClock,
  Check,
  LocateFixed,
  LocateOff,
  MapPin,
  MapPinOff,
  QrCode,
  SatelliteDish,
  Timer,
  TimerOff,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CheckinResult, MemberSession } from "@/lib/checkin-types";
import { cn } from "@/lib/utils";

// Check-in states and their screens, shared by the automatic check-in card (member
// home) and the QR scanner (/scan), so both speak the same way.

// Church Wi-Fi can be poor: give up on a request after this and offer a retry.
export const REQUEST_TIMEOUT_MS = 20_000;

export type View =
  | { kind: "no-service"; next: MemberSession | null }
  | { kind: "locating" }
  | { kind: "checking" }
  | { kind: "checked-in"; checkedInAt: string }
  | { kind: "too-far"; distanceM: number; radiusM?: number }
  | { kind: "low-accuracy"; accuracyM: number; maxAccuracyM: number }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "rate-limited"; retryAfterS: number }
  /** A service is open but an automatic retry would come too soon after the last one. */
  | { kind: "ready" }
  /** No response at all (network). */
  | { kind: "offline" }
  /** The server answered, but not with a check-in result (500, bad input). */
  | { kind: "error" }
  /** QR only: not a Pulse code, or tampered with. */
  | { kind: "invalid-qr" }
  /** QR only: a genuine code whose service has ended (e.g. last week's). */
  | { kind: "expired-qr" };

export type Reading = { lat: number; lng: number; accuracy: number };

export function readPosition(): Promise<Reading | "denied" | "unavailable"> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve("unavailable");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/**
 * POSTs a check-in and maps the answer to a screen. "unauthenticated" means the
 * session has ended; callers send the member to /login.
 */
export async function submitCheckin(
  endpoint: "/api/checkin/geofence" | "/api/checkin/qr",
  body: Reading & { token?: string },
): Promise<View | "unauthenticated"> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!response) return { kind: "offline" };
  if (response.status === 401) return "unauthenticated";
  const json = (await response.json().catch(() => null)) as Partial<CheckinResult> | null;
  if (typeof json?.ok !== "boolean") return { kind: "error" };
  const result = json as CheckinResult;

  if (result.ok) return { kind: "checked-in", checkedInAt: result.checkedInAt };
  switch (result.reason) {
    case "OUTSIDE_GEOFENCE":
      return { kind: "too-far", distanceM: result.distanceM, radiusM: result.radiusM };
    case "LOW_ACCURACY":
      return {
        kind: "low-accuracy",
        accuracyM: result.accuracyM,
        maxAccuracyM: result.maxAccuracyM,
      };
    case "RATE_LIMITED":
      return { kind: "rate-limited", retryAfterS: result.retryAfterS };
    case "NO_OPEN_SESSION":
      return { kind: "no-service", next: null };
    case "INVALID_QR":
      return { kind: "invalid-qr" };
    case "EXPIRED_QR":
      return { kind: "expired-qr" };
    default:
      return { kind: "error" };
  }
}

// ---------------------------------------------------------------- presentation

// Built from formatToParts so the server (Node ICU) and the browser produce identical
// text: some ICU versions put a narrow no-break space before am/pm, which would
// cause a hydration mismatch if we matched on the formatted string.
function zonedParts(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).formatToParts(
    new Date(iso),
  );
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
}

/** "Sunday at 8:14 am" in church time. */
export const formatTime = (iso: string, timeZone: string) => {
  const get = zonedParts(iso, timeZone, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${get("weekday")} at ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
};

/** The next service's day ("Sunday 25 October") and opening time ("08:00"). */
export const formatNext = (session: MemberSession, timeZone: string) => {
  const get = zonedParts(session.startsAt, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return {
    day: `${get("weekday")} ${get("day")} ${get("month")}`,
    time: `${get("hour")}:${get("minute")}`,
    started: new Date(session.startsAt).getTime() <= Date.now(),
  };
};

type Tone = "success" | "busy" | "warning" | "muted";

export function StateIcon({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "relative flex size-20 shrink-0 items-center justify-center rounded-full",
        tone === "success" && "bg-success-soft",
        tone === "busy" && "bg-secondary",
        tone === "warning" && "bg-warning/15",
        tone === "muted" && "bg-muted",
      )}
      aria-hidden
    >
      {tone === "busy" && (
        <span className="absolute inset-3 animate-pulse-ring rounded-full bg-primary/40" />
      )}
      <span
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full [&_svg]:size-7",
          tone === "success" && "bg-success text-success-foreground",
          tone === "busy" && "bg-primary text-primary-foreground",
          tone === "warning" && "bg-warning text-warning-foreground",
          tone === "muted" && "bg-card text-muted-foreground",
        )}
      >
        {children}
      </span>
    </span>
  );
}

export function Message({
  tone,
  icon,
  title,
  children,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <StateIcon tone={tone}>{icon}</StateIcon>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h2>
      {children && <div className="mt-2 space-y-3 text-muted-foreground">{children}</div>}
    </div>
  );
}

/** The QR fallback, offered under most problems on the home card. */
export function ScanInsteadLink() {
  return (
    <Button asChild variant="outline" className="h-12 rounded-xl text-base">
      <Link href="/scan">Scan QR instead</Link>
    </Button>
  );
}

function Actions({
  onRetry,
  retry = true,
  secondary,
}: {
  onRetry: () => void;
  retry?: boolean;
  secondary: React.ReactNode;
}) {
  return (
    <div className="mt-7 grid gap-2.5">
      {retry && (
        <Button onClick={onRetry} className="h-12 rounded-xl text-base">
          Try again
        </Button>
      )}
      {secondary}
    </div>
  );
}

const isIos = () =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function ViewBody({
  view,
  timeZone,
  onRetry,
  secondary = <ScanInsteadLink />,
}: {
  view: View;
  timeZone: string;
  onRetry: () => void;
  /** The second button under problems: "Scan QR instead" by default. */
  secondary?: React.ReactNode;
}) {
  switch (view.kind) {
    case "locating":
      return (
        <Message tone="busy" icon={<LocateFixed />} title="Finding you…">
          <p>
            Allow location if your phone asks. Pulse only uses it to confirm you&apos;re at church.
          </p>
        </Message>
      );
    case "checking":
      return <Message tone="busy" icon={<MapPin />} title="Checking you in…" />;
    case "checked-in":
      return (
        <Message tone="success" icon={<Check strokeWidth={2.75} />} title="You're checked in">
          <p className="tabular">{formatTime(view.checkedInAt, timeZone)}</p>
        </Message>
      );
    case "too-far":
      return (
        <>
          <Message tone="warning" icon={<MapPinOff />} title="You're not at church yet">
            <p className="tabular">
              You&apos;re about {formatDistance(view.distanceM)} away.
              {view.radiusM ? ` Check-in works within ${view.radiusM} m of the church.` : ""}
            </p>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "low-accuracy":
      return (
        <>
          <Message tone="warning" icon={<SatelliteDish />} title="Your location is too rough">
            <p className="tabular">
              Your phone is accurate to about {view.accuracyM} m right now, and check-in needs{" "}
              {view.maxAccuracyM} m or better. Step outside or near a window, then try again.
            </p>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "denied":
      return (
        <>
          <Message tone="warning" icon={<LocateOff />} title="Location is off for Pulse">
            <p>Pulse needs your location to check you in. To turn it on:</p>
            <ol className="list-decimal space-y-1 pl-5 text-left">
              {isIos() ? (
                <>
                  <li>Open Settings, then Privacy &amp; Security, then Location Services.</li>
                  <li>Choose Safari Websites (or Pulse) and pick &ldquo;While Using&rdquo;.</li>
                  <li>Come back here and tap Try again.</li>
                </>
              ) : (
                <>
                  <li>Tap the icon next to the web address at the top of the screen.</li>
                  <li>Open Permissions (or Site settings) and allow Location.</li>
                  <li>Come back here and tap Try again.</li>
                </>
              )}
            </ol>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "unavailable":
      return (
        <>
          <Message tone="warning" icon={<LocateOff />} title="We couldn't find your location">
            <p>Make sure location services are on for your phone, then try again.</p>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "rate-limited":
      return (
        <>
          <Message tone="warning" icon={<Timer />} title="Too many tries">
            <p className="tabular">
              Wait about {Math.max(1, Math.ceil(view.retryAfterS / 60))} min, then try again.
            </p>
          </Message>
          <Actions onRetry={onRetry} retry={false} secondary={secondary} />
        </>
      );
    case "offline":
      return (
        <>
          <Message tone="warning" icon={<WifiOff />} title="Couldn't reach Pulse">
            <p>Check your connection, then try again.</p>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "error":
      return (
        <>
          <Message tone="warning" icon={<TriangleAlert />} title="Something went wrong">
            <p>That one&apos;s on our side. Try again in a minute.</p>
          </Message>
          <Actions onRetry={onRetry} secondary={secondary} />
        </>
      );
    case "ready":
      return (
        <>
          <Message tone="busy" icon={<MapPin />} title="Ready to check in">
            <p>The service is open. Tap below when you&apos;re at church.</p>
          </Message>
          <div className="mt-7 grid">
            <Button onClick={onRetry} className="h-12 rounded-xl text-base">
              Check in
            </Button>
          </div>
        </>
      );
    case "invalid-qr":
      return (
        <>
          <Message tone="warning" icon={<QrCode />} title="That's not a Pulse code">
            <p>Scan the code on the screen at the front of church.</p>
          </Message>
          <Actions onRetry={onRetry} retry={false} secondary={secondary} />
        </>
      );
    case "expired-qr":
      return (
        <>
          <Message tone="warning" icon={<TimerOff />} title="That code has expired">
            <p>It&apos;s from a service that has ended. Scan the code on the screen today.</p>
          </Message>
          <Actions onRetry={onRetry} retry={false} secondary={secondary} />
        </>
      );
    case "no-service": {
      const next = view.next && formatNext(view.next, timeZone);
      return (
        <Message tone="muted" icon={<CalendarClock />} title="See you on Sunday">
          {next?.started ? (
            <p>
              Check-in for today&apos;s service opens in a few minutes. Come back to Pulse then and
              it will check you in.
            </p>
          ) : next ? (
            <p>
              Next service: {next.day}. Check-in opens at{" "}
              <span className="tabular">{next.time}</span>. Open Pulse when you arrive and
              you&apos;re counted.
            </p>
          ) : (
            <p>Open Pulse when you arrive at church and you&apos;re counted.</p>
          )}
        </Message>
      );
    }
  }
}

const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${m} m`;
