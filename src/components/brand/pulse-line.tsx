import { cn } from "@/lib/utils";

type PulseLineProps = {
  /** One entry per Sunday, oldest first: true = attended (a beat), false = flat. */
  beats: boolean[];
  className?: string;
};

const STEP = 64;
const HEIGHT = 56;
const MID = HEIGHT / 2;

/**
 * Pulse's signature motif: an attendance record drawn as a heartbeat. Each
 * Sunday attended is a beat; a missed one stays flat. Draws once on load.
 */
export function PulseLine({ beats, className }: PulseLineProps) {
  const width = beats.length * STEP;
  let d = `M0 ${MID}`;
  beats.forEach((beat, i) => {
    const x = i * STEP;
    d += beat
      ? ` H${x + 18} L${x + 24} ${MID - 8} L${x + 31} ${MID + 18} L${x + 38} 4 L${x + 45} ${MID + 6} L${x + 50} ${MID}`
      : ` H${x + 50}`;
  });
  d += ` H${width}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-14 w-full animate-reveal-x overflow-visible", className)}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
