import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { UnsubscribeForm } from "@/components/member/unsubscribe-form";
import { Skeleton } from "@/components/ui/skeleton";
import { unsubscribeInput } from "@/lib/schemas";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Email preferences" };

// Public (no login): reached from the link in a "we missed you" email.
export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header>
        <Logo />
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MailX className="size-7" aria-hidden />
        </span>
        <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
          <Unsubscribe searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Unsubscribe({ searchParams }: Pick<PageProps<"/unsubscribe">, "searchParams">) {
  const parsed = unsubscribeInput.safeParse(await searchParams);
  const valid = parsed.success && verifyUnsubscribe(parsed.data.u, parsed.data.s);
  if (!parsed.success || !valid) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">This link doesn&apos;t work</h1>
        <p className="text-muted-foreground">
          It may have been cut short. Open Pulse and go to Settings to change your emails instead.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Stop &ldquo;we missed you&rdquo; emails?</h1>
        <p className="text-muted-foreground">
          We send one when you miss a Sunday. Your attendance is still recorded, and your leaders
          can still reach out.
        </p>
      </div>
      <UnsubscribeForm userId={parsed.data.u} signature={parsed.data.s} />
    </>
  );
}
