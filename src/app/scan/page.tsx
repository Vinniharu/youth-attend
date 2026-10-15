import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { QrCheckin } from "@/components/qr/qr-checkin";
import { Skeleton } from "@/components/ui/skeleton";
import { appTimeZone } from "@/lib/config";
import { requireUser } from "@/lib/dal";
import { extractToken } from "@/lib/qr-link";

export const metadata: Metadata = { title: "Scan QR" };

// The QR fallback. Reached from the home card ("Scan QR instead"), or straight from
// a phone's camera app: the code on the church screen encodes /scan?t=<token>.
export default function ScanPage({ searchParams }: PageProps<"/scan">) {
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
      <main className="flex flex-1 flex-col gap-6 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Scan the code</h1>
          <p className="text-muted-foreground">
            When your location won&apos;t check you in on its own, scan the code on the screen at
            the front of church.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="aspect-square w-full rounded-[2rem]" />}>
          <Scan searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Scan({ searchParams }: Pick<PageProps<"/scan">, "searchParams">) {
  // allowIncomplete: a brand-new member scanning at church checks in first and adds
  // their name afterwards (home sends them to /welcome), so the scanned code is kept.
  await requireUser({ allowIncomplete: true });
  const { t } = await searchParams;
  const token = typeof t === "string" ? extractToken(t) : null;
  return <QrCheckin initialToken={token} timeZone={appTimeZone()} />;
}
