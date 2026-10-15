import Image from "next/image";

import rccgLogo from "@/assets/brand/rccg-logo.png";
import { cn } from "@/lib/utils";

type ChurchMarkProps = {
  /** Rendered size in CSS pixels; next/image serves a matching small file. */
  size?: number;
  className?: string;
  /** Load eagerly (headers above the fold). */
  priority?: boolean;
};

/**
 * The RCCG badge, Pulse's brand mark. Use it as supplied: never crop, recolour or
 * stretch it, and keep it on calm backgrounds. App icons come from the same master
 * (`npm run icons`).
 */
export function ChurchMark({ size = 36, className, priority }: ChurchMarkProps) {
  return (
    <Image
      src={rccgLogo}
      alt="The Redeemed Christian Church of God"
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      // Pin the box: the base `img { max-width: 100%; height: auto }` rule would
      // otherwise let a flex layout squash the round badge into an oval.
      style={{ width: size, height: size }}
      className={cn("max-w-none shrink-0 rounded-full", className)}
    />
  );
}

/** Mark + "Pulse" wordmark. The wordmark inherits text colour, so it works on any surface. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ChurchMark priority />
      <span className="font-heading text-xl font-semibold tracking-tight">Pulse</span>
    </span>
  );
}
