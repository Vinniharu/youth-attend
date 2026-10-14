import { cn } from "@/lib/utils";

const tones = {
  live: "bg-success",
  idle: "bg-muted-foreground",
  warning: "bg-warning",
} as const;

type StatusDotProps = {
  tone?: keyof typeof tones;
  /** Animated ring for live states (e.g. "service is open"). */
  pulsing?: boolean;
  className?: string;
};

export function StatusDot({ tone = "live", pulsing = tone === "live", className }: StatusDotProps) {
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden>
      {pulsing && (
        <span className={cn("absolute inset-0 animate-pulse-ring rounded-full", tones[tone])} />
      )}
      <span className={cn("relative inline-flex size-2.5 rounded-full", tones[tone])} />
    </span>
  );
}
