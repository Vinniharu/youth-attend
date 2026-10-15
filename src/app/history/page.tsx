import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { PulseLine } from "@/components/brand/pulse-line";
import { HistoryList } from "@/components/member/history-list";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/dal";
import { getMemberHistory } from "@/lib/members";

export const metadata: Metadata = { title: "My Sundays" };

export default function HistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Pulse home">
          <Logo />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-8 py-8">
        <h1 className="text-3xl font-semibold">My Sundays</h1>
        <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
          <History />
        </Suspense>
      </main>
    </div>
  );
}

async function History() {
  const user = await requireUser();
  const history = await getMemberHistory(user.id);
  const finished = history.filter((h) => h.outcome === "attended" || h.outcome === "absent");
  const beats = finished
    .slice(0, 12)
    .reverse()
    .map((h) => h.outcome === "attended");
  const attended = finished.filter((h) => h.outcome === "attended").length;

  return (
    <>
      {beats.length > 0 && (
        <section className="space-y-3" aria-label="Recent attendance">
          <p className="tabular text-muted-foreground">
            <span className="font-heading text-4xl font-semibold text-foreground">{attended}</span>{" "}
            of {finished.length} Sundays since you joined
          </p>
          <PulseLine beats={beats} className="text-primary" />
        </section>
      )}
      <HistoryList entries={history} />
    </>
  );
}
