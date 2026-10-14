import { Check } from "lucide-react";

import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

// Demo record for the preview card: the last eight Sundays.
export const DEMO_BEATS = [true, true, false, true, true, true, true, true];

/** A static preview of the member check-in screen, in its success state. */
export function CheckinPreview({ className }: { className?: string }) {
  const attended = DEMO_BEATS.filter(Boolean).length;
  return (
    <figure
      aria-label="Preview of the Pulse check-in screen"
      className={cn("w-full max-w-sm rounded-[2rem] border bg-card p-6 shadow-lg", className)}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Good morning, Tobi</span>
        <span className="flex items-center gap-2 font-medium">
          <StatusDot />
          Service open
        </span>
      </div>

      <div className="mt-8 flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-success-soft">
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="size-7" strokeWidth={2.75} aria-hidden />
          </span>
        </span>
        <p className="mt-5 font-heading text-2xl font-semibold tracking-tight">
          You&apos;re checked in
        </p>
        <p className="tabular mt-1 text-muted-foreground">Sunday at 8:14 am</p>
      </div>

      <div className="mt-8 rounded-2xl bg-muted p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Your last 8 Sundays</span>
          <span className="tabular text-muted-foreground">
            {attended} of {DEMO_BEATS.length}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {DEMO_BEATS.map((beat, i) => (
            <span
              key={i}
              className={
                beat
                  ? "h-6 flex-1 rounded-md bg-primary"
                  : "h-6 flex-1 rounded-md border border-dashed border-muted-foreground/40"
              }
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
