"use client";

import { useState } from "react";

export type TrendPoint = { serviceDate: string; attended: number; expected: number };

const label = (date: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(style === "long" && { weekday: "short" }),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const W = 640;
const H = 220;
const PAD = { top: 28, right: 8, bottom: 28, left: 8 };

/**
 * Attendance per Sunday (single series, one hue: --chart-1, validated for both
 * themes). Thin bars with 4px rounded tops on the baseline, a recessive gridline at
 * the roster size, a direct label on the latest bar only, hover/focus tooltip per
 * bar, and a table view for screen readers.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
        The trend appears after the first Sunday is finished.
      </p>
    );
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.attended, p.expected)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / points.length;
  const barW = Math.min(36, slot - 2); // >= 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const roster = points.at(-1)!.expected;
  const last = points.length - 1;
  const shown = active ?? last;
  const focus = points[shown]!;
  const rate = (p: TrendPoint) => (p.expected ? Math.round((p.attended / p.expected) * 100) : 0);

  return (
    <figure className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Attendance for the last ${points.length} Sundays`}
          onMouseLeave={() => setActive(null)}
        >
          {/* Recessive gridline: today's roster size. */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(roster)}
            y2={y(roster)}
            className="stroke-border"
            strokeDasharray="4 4"
          />
          <text
            x={W - PAD.right}
            y={y(roster) - 6}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            {roster} members
          </text>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            className="stroke-border"
          />
          {points.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const h = Math.max(0, PAD.top + plotH - y(p.attended));
            const r = Math.min(4, h / 2, barW / 2);
            const top = y(p.attended);
            const bottom = PAD.top + plotH;
            return (
              <g key={p.serviceDate}>
                {/* Rounded top, square base: anchored to the baseline. */}
                <path
                  d={`M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`}
                  className="fill-chart-1"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
                {i === last && (
                  <text
                    x={x + barW / 2}
                    y={top - 6}
                    textAnchor="middle"
                    className="tabular fill-foreground text-[12px] font-semibold"
                  >
                    {p.attended}
                  </text>
                )}
                {(points.length <= 6 || i % 2 === last % 2) && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {label(p.serviceDate)}
                  </text>
                )}
                {/* Hit target: the whole column, bigger than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${label(p.serviceDate, "long")}: ${p.attended} of ${p.expected}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none"
                />
              </g>
            );
          })}
        </svg>
        <p
          aria-live="polite"
          className="tabular pointer-events-none mt-1 text-sm text-muted-foreground"
        >
          <span className="font-medium text-foreground">{label(focus.serviceDate, "long")}</span>:{" "}
          {focus.attended} of {focus.expected} checked in ({rate(focus)}%)
        </p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
        <table className="tabular mt-2 w-full max-w-sm text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Sunday</th>
              <th className="py-1 font-medium">Checked in</th>
              <th className="py-1 font-medium">Of</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.serviceDate} className="border-t">
                <td className="py-1">{label(p.serviceDate, "long")}</td>
                <td className="py-1">{p.attended}</td>
                <td className="py-1">{p.expected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
