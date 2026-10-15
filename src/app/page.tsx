import { Check, MapPin, Smartphone } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { PulseLine } from "@/components/brand/pulse-line";
import { CheckinCard } from "@/components/checkin/checkin-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appTimeZone } from "@/lib/config";
import { requireUser } from "@/lib/dal";
import { getMemberStatus, getRecentSundays } from "@/lib/member-status";
import { firstName, greeting } from "@/lib/greeting";

// Member home: automatic check-in when a service is open, plus recent attendance.

const STEPS = [
  {
    icon: MapPin,
    title: "Arrive at church",
    body: "Check-in opens when the service starts and closes when it ends.",
  },
  {
    icon: Smartphone,
    title: "Open Pulse",
    body: "Your phone confirms you're at church. If GPS struggles indoors, scan the code on the screen instead.",
  },
  {
    icon: Check,
    title: "You're counted",
    body: "That's it. Miss a few Sundays and a leader will reach out to see how you're doing.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <SignOutButton />
      </header>

      <main className="flex flex-1 flex-col gap-16 pt-4 pb-20 lg:pt-10">
        <Suspense fallback={<WelcomeSkeleton />}>
          <Welcome />
        </Suspense>

        <section aria-labelledby="how-it-works" className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 id="how-it-works" className="text-2xl font-semibold sm:text-3xl">
            How Sunday check-in works
          </h2>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-3">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="tabular text-sm font-medium text-muted-foreground">
                    Step {i + 1}
                  </span>
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

async function Welcome() {
  const user = await requireUser();
  const timeZone = appTimeZone();
  const [status, recent] = await Promise.all([getMemberStatus(user.id), getRecentSundays(user.id)]);

  return (
    <section className="space-y-8">
      <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1] font-semibold">
        {greeting(new Date(), timeZone)}, {firstName(user.name)}
      </h1>

      <div className="grid gap-10 lg:grid-cols-[28rem_1fr] lg:items-center">
        <CheckinCard initial={status} timeZone={timeZone} />

        {recent.beats.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold">
                Your last {recent.beats.length === 1 ? "Sunday" : `${recent.beats.length} Sundays`}
              </h2>
              <p className="tabular text-muted-foreground">
                {recent.attended} of {recent.beats.length}
              </p>
            </div>
            <PulseLine beats={recent.beats} className="text-primary" />
          </div>
        )}
      </div>

      {user.role === "admin" && (
        <Button asChild variant="outline" className="h-10 rounded-xl px-4">
          <Link href="/admin">Open admin</Link>
        </Button>
      )}
    </section>
  );
}

function WelcomeSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Skeleton className="h-14 w-3/4 max-w-lg" />
      <Skeleton className="h-80 w-full max-w-md rounded-[2rem]" />
    </div>
  );
}
