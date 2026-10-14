import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import type { ServiceSession } from "@/db/schema";

const LABELS: Record<ServiceSession["status"], string> = {
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
  processed: "Processed",
  cancelled: "Cancelled",
};

export function SessionStatus({ status }: { status: ServiceSession["status"] }) {
  if (status === "open") {
    return (
      // Neutral surface: emerald fills are reserved for "you're checked in". The live
      // dot matches the member screen's "Service open" indicator.
      <Badge variant="secondary" className="gap-1.5">
        <StatusDot />
        {LABELS.open}
      </Badge>
    );
  }
  return (
    <Badge
      variant={
        status === "cancelled" ? "destructive" : status === "scheduled" ? "outline" : "secondary"
      }
    >
      {LABELS[status]}
    </Badge>
  );
}
