import { Check, Minus, X } from "lucide-react";

import type { HistoryEntry } from "@/lib/members";
import { cn } from "@/lib/utils";

const OUTCOME: Record<HistoryEntry["outcome"], { label: string; icon: typeof Check }> = {
  attended: { label: "Here", icon: Check },
  excused: { label: "Excused", icon: Minus },
  absent: { label: "Missed", icon: X },
  upcoming: { label: "Coming up", icon: Minus },
};

const METHOD: Record<string, string> = {
  auto_geofence: "by location",
  qr_scan: "by QR code",
  manual_admin: "marked by a leader",
};

const day = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

/** A member's Sundays, newest first. Shared by the admin member page and /history. */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-5 py-6 text-center text-muted-foreground">
        No Sundays yet.
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
      {entries.map((entry) => {
        const { label, icon: Icon } = OUTCOME[entry.outcome];
        return (
          <li key={entry.sessionId} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="tabular">{day(entry.serviceDate)}</span>
            <span
              className={cn(
                "flex items-center gap-1.5 text-sm",
                entry.outcome === "attended"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full [&_svg]:size-3",
                  entry.outcome === "attended"
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                <Icon strokeWidth={3} />
              </span>
              {label}
              {entry.method ? ` ${METHOD[entry.method] ?? ""}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
