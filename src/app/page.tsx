import { Check, MapPin, Smartphone } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { PulseLine } from "@/components/brand/pulse-line";
import { StatusDot } from "@/components/ui/status-dot";

// Placeholder home until Phase 4 replaces it with the live check-in screen.

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

// Demo record for the preview card: the last eight Sundays.
const DEMO_BEATS = [true, true, false, true, true, true, true, true];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col gap-16 pt-6 pb-20 lg:gap-24 lg:pt-14">
        <section className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(2.75rem,7.5vw,5rem)] leading-[0.95] font-semibold">
              Walk in.
              <br />
              You&apos;re counted.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Open Pulse when you arrive on Sunday and your attendance is recorded in seconds. No
              registers, no queues.
            </p>
          </div>

          <CheckinPreview />
        </section>

        <PulseLine beats={DEMO_BEATS} className="text-primary" />

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

      <footer className="border-t py-8 text-sm text-muted-foreground">
        Pulse uses your location only to confirm you&apos;re at church, and deletes it automatically
        after a short retention period.
      </footer>
    </div>
  );
}

/** A static preview of the member check-in screen, in its success state. */
function CheckinPreview() {
  return (
    <figure
      aria-label="Preview of the Pulse check-in screen"
      className="mx-auto w-full max-w-sm rounded-[2rem] border bg-card p-6 shadow-lg lg:mr-0"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Good morning, Tobi</span>
        <span className="flex items-center gap-2 font-medium">
          <StatusDot />
          Service open
        </span>
      </div>

      <div className="mt-8 flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-success-soft">
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="size-7" strokeWidth={2.75} aria-hidden />
          </span>
        </span>
        <p className="mt-5 font-heading text-2xl font-semibold tracking-tight">
          You&apos;re checked in
        </p>
        <p className="tabular mt-1 text-muted-foreground">Sunday at 8:14 am</p>
      </div>

      <div className="mt-8 rounded-2xl bg-muted p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Your last 8 Sundays</span>
          <span className="tabular text-muted-foreground">7 of 8</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {DEMO_BEATS.map((attended, i) => (
            <span
              key={i}
              className={
                attended
                  ? "h-6 flex-1 rounded-md bg-primary"
                  : "h-6 flex-1 rounded-md border border-dashed border-muted-foreground/40"
              }
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
