import { cn } from "@/lib/utils";

/** The heartbeat stroke inside the mark. Shared with the app icon. */
export const PULSE_MARK_PATH = "M4 16.5h5.2l2.3-6 4 12 3.2-9 1.8 3h5.5";

type MarkProps = { className?: string; title?: string };

/** Pulse app mark: a heartbeat line in a rounded ocean-blue square. */
export function PulseMark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d={PULSE_MARK_PATH}
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + wordmark. Inherits text colour, so it works on any surface. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PulseMark className="size-8" />
      <span className="font-heading text-xl font-semibold tracking-tight">Pulse</span>
    </span>
  );
}
