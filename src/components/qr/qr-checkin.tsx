"use client";

import type { IScannerError } from "@yudiel/react-qr-scanner";
import { CameraOff, ScanLine } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Message,
  readPosition,
  submitCheckin,
  ViewBody,
  type View,
} from "@/components/checkin/checkin-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { extractToken } from "@/lib/qr-link";

const CameraScanner = dynamic(() => import("./camera-scanner"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

type Phase =
  | { kind: "scanning" }
  | { kind: "camera-error"; denied: boolean }
  /** Read something that isn't a Pulse code: keep scanning, with a hint. */
  | { kind: "wrong-code" }
  | { kind: "result"; view: View };

type Props = {
  /** A token from the link the phone's own camera opened (/scan?t=…). */
  initialToken: string | null;
  timeZone: string;
};

/**
 * QR fallback: scan the code on the church screen (or arrive here from the
 * phone camera via its link), then confirm location and check in.
 */
export function QrCheckin({ initialToken, timeZone }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() =>
    initialToken ? { kind: "result", view: { kind: "locating" } } : { kind: "scanning" },
  );
  const token = useRef<string | null>(initialToken);
  const inFlight = useRef(false);

  const checkIn = useCallback(async () => {
    if (inFlight.current || !token.current) return;
    inFlight.current = true;
    try {
      setPhase({ kind: "result", view: { kind: "locating" } });
      const reading = await readPosition();
      if (reading === "denied" || reading === "unavailable") {
        return setPhase({ kind: "result", view: { kind: reading } });
      }
      setPhase({ kind: "result", view: { kind: "checking" } });
      const view = await submitCheckin("/api/checkin/qr", { ...reading, token: token.current });
      if (view === "unauthenticated") return router.replace("/login?next=/scan");
      setPhase({ kind: "result", view });
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  // Arrived from the phone camera: drop the token from the address bar (it expires
  // within a minute, so a reload must not reuse it) and check in straight away.
  useEffect(() => {
    if (!initialToken) return;
    window.history.replaceState(null, "", "/scan");
    void checkIn();
  }, [initialToken, checkIn]);

  const onScan = (text: string) => {
    if (phase.kind !== "scanning" && phase.kind !== "wrong-code") return;
    const scanned = extractToken(text);
    if (!scanned) return setPhase({ kind: "wrong-code" });
    token.current = scanned;
    void checkIn();
  };

  const onCameraError = (error: IScannerError) =>
    setPhase({ kind: "camera-error", denied: error.kind === "permission-denied" });

  const scanAgain = () => {
    token.current = null;
    setPhase({ kind: "scanning" });
  };

  if (phase.kind === "result") {
    return (
      <div aria-live="polite" className="rounded-[2rem] border bg-card p-6 shadow-lg sm:p-7">
        <ViewBody
          view={phase.view}
          timeZone={timeZone}
          onRetry={() => void checkIn()}
          secondary={
            <Button variant="outline" onClick={scanAgain} className="h-12 rounded-xl text-base">
              Scan again
            </Button>
          }
        />
      </div>
    );
  }

  if (phase.kind === "camera-error") {
    return (
      <div className="rounded-[2rem] border bg-card p-6 shadow-lg sm:p-7">
        <Message
          tone="warning"
          icon={<CameraOff />}
          title={phase.denied ? "Camera is off for Pulse" : "The camera didn't start"}
        >
          <p>
            {phase.denied
              ? "Allow the camera in your browser's site settings, then try again. Or open your phone's camera app and point it at the code."
              : "Close other apps using the camera, then try again. Or open your phone's camera app and point it at the code."}
          </p>
          <p>Still stuck? A youth leader can mark you present.</p>
        </Message>
        <div className="mt-7 grid">
          <Button onClick={scanAgain} className="h-12 rounded-xl text-base">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] border bg-muted shadow-lg">
        <CameraScanner onScan={onScan} onError={onCameraError} />
      </div>
      <p aria-live="polite" className="flex items-start gap-2 text-sm text-muted-foreground">
        <ScanLine className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {phase.kind === "wrong-code"
          ? "That's a different QR code. Point at the Pulse code on the screen at the front of church."
          : "Point your camera at the code on the screen. You'll also be asked for your location."}
      </p>
    </div>
  );
}
