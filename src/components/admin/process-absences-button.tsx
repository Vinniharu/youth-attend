"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type RunResult = {
  sessions: { absent: number; newlyFlagged: number }[];
  emails: { sent: number; failed: number; skipped: number };
};

/** Runs the absence engine for one closed session now (the scheduler does it Sunday 21:00). */
export function ProcessAbsencesButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const response = await fetch(`/api/admin/sessions/${sessionId}/process`, {
        method: "POST",
      }).catch(() => null);
      if (!response?.ok) {
        toast.error(
          response?.status === 409
            ? "Only a closed session can be processed."
            : "Couldn't process absences. Try again.",
        );
        return;
      }
      const result = (await response.json()) as RunResult;
      const s = result.sessions[0];
      toast.success(
        `Processed: ${s?.absent ?? 0} absent, ${s?.newlyFlagged ?? 0} newly flagged, ` +
          `${result.emails.sent} emails sent.`,
      );
      router.refresh();
    });

  return (
    <Button variant="outline" onClick={run} disabled={pending} className="h-11 rounded-xl px-4">
      {pending ? "Processing…" : "Process absences now"}
    </Button>
  );
}
