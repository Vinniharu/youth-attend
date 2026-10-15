import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Scan QR" };

// Placeholder until Phase 6 adds the scanner.
export default function ScanPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header>
        <Link href="/" aria-label="Pulse home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <ScanPlaceholder />
        </Suspense>
      </main>
    </div>
  );
}

async function ScanPlaceholder() {
  await requireUser();
  return (
    <>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <QrCode className="size-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Scanning is coming soon</h1>
        <p className="text-muted-foreground">
          Soon you&apos;ll be able to scan the code on the screen at church when your location
          won&apos;t work. Until then, ask a youth leader to mark you present.
        </p>
      </div>
      <Button asChild variant="outline" className="h-12 rounded-xl text-base">
        <Link href="/">Back to check-in</Link>
      </Button>
    </>
  );
}
