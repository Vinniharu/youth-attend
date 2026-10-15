"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Gives the session a new check-in code, for when the old one has been shared.
 * Asks once before doing it: every printed or photographed copy stops working.
 */
export function ResetQrButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () =>
    startTransition(async () => {
      const response = await fetch(`/api/admin/sessions/${sessionId}/qr-reset`, {
        method: "POST",
      }).catch(() => null);
      setConfirming(false);
      if (!response?.ok) {
        toast.error(
          response?.status === 409
            ? "This service has ended, so its code can't be reset."
            : "Couldn't reset the code. Try again.",
        );
        return;
      }
      toast.success("New check-in code ready. The screen updates within 15 seconds.");
    });

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)} className="h-11 rounded-xl px-4">
        <RotateCcw aria-hidden />
        Reset code
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Old copies of the code will stop working.
      </span>
      <Button variant="outline" onClick={reset} disabled={pending} className="h-11 rounded-xl px-4">
        {pending ? "Resetting…" : "Reset now"}
      </Button>
      <Button
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="h-11 rounded-xl px-4"
      >
        Keep it
      </Button>
    </span>
  );
}
