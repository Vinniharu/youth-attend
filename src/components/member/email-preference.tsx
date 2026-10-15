"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** The "we missed you" email switch on /settings. */
export function EmailPreference({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const next = !enabled;
      setEnabled(next);
      const problem = await sendJson("/api/me/preferences", "PATCH", { emailNotifications: next });
      if (problem) {
        setEnabled(!next);
        toast.error(problem);
        return;
      }
      toast.success(next ? "Emails turned on." : "Emails turned off.");
    });

  return (
    <div className="flex items-start justify-between gap-6 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <p id="missed-you-label" className="font-medium">
          &ldquo;We missed you&rdquo; emails
        </p>
        <p className="text-sm text-muted-foreground">
          A short note when you miss a Sunday. Your attendance is recorded either way.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="missed-you-label"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          enabled ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
