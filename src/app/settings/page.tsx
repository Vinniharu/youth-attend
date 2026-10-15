import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { EmailPreference } from "@/components/member/email-preference";
import { ProfileForm } from "@/components/member/profile-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/dal";
import { getEmailNotifications, getProfile } from "@/lib/preferences";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
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
        <h1 className="text-3xl font-semibold">Settings</h1>
        <Suspense fallback={<Skeleton className="h-28 rounded-2xl" />}>
          <Settings />
        </Suspense>
      </main>
    </div>
  );
}

async function Settings() {
  const user = await requireUser();
  const [emailNotifications, profile] = await Promise.all([
    getEmailNotifications(user.id),
    getProfile(user.id),
  ]);
  return (
    <>
      <section className="space-y-3" aria-labelledby="details">
        <h2 id="details" className="text-lg font-semibold">
          Your details
        </h2>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <ProfileForm initial={profile} mode="settings" />
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="emails">
        <h2 id="emails" className="text-lg font-semibold">
          Emails
        </h2>
        <EmailPreference initial={emailNotifications} />
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-5 shadow-sm">
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <div className="-ml-2.5 pt-1">
          <SignOutButton />
        </div>
      </section>
    </>
  );
}
