"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type Props = { userId: string; signature: string };

/** A button, not an automatic action: email link scanners would otherwise unsubscribe people. */
export function UnsubscribeForm({ userId, signature }: Props) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const unsubscribe = () =>
    startTransition(async () => {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ u: userId, s: signature }),
      }).catch(() => null);
      setState(response?.ok ? "done" : "error");
    });

  if (state === "done") {
    return (
      <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-secondary-foreground">
        Done. You won&apos;t get these emails any more. You can turn them back on in Pulse under
        Settings.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Button onClick={unsubscribe} disabled={pending} className="h-12 w-full rounded-xl text-base">
        {pending ? "Turning off…" : "Stop these emails"}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-sm text-destructive">
          That didn&apos;t work. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
