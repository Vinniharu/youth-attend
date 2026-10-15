import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { ProfileForm } from "@/components/member/profile-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/dal";
import { getProfile } from "@/lib/preferences";

export const metadata: Metadata = { title: "Welcome" };

/** First stop after signing up: a new account adds its name (and phone) here. */
export default function WelcomePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header>
        <Logo />
      </header>
      <main className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold">Welcome to Pulse</h1>
          <p className="text-muted-foreground">
            You&apos;re in. Tell us your name so leaders know who&apos;s here, and we&apos;ll keep
            track of your Sundays from now on.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <Welcome />
        </Suspense>
      </main>
    </div>
  );
}

async function Welcome() {
  const user = await requireUser({ allowIncomplete: true });
  if (!user.needsProfile) redirect(user.role === "admin" ? "/admin" : "/");
  const profile = await getProfile(user.id);
  return <ProfileForm initial={profile} mode="welcome" />;
}
