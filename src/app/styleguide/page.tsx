import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChurchMark, Logo } from "@/components/brand/logo";
import { PulseLine } from "@/components/brand/pulse-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";

export const metadata: Metadata = { title: "Styleguide" };

// Development reference for the Pulse design system. Hidden in production.

const COLORS = [
  { name: "Background", token: "bg-background", note: "Page" },
  { name: "Foreground", token: "bg-foreground", note: "Text" },
  { name: "Primary", token: "bg-primary", note: "Actions, links" },
  { name: "Secondary", token: "bg-secondary", note: "Soft surfaces" },
  { name: "Muted", token: "bg-muted", note: "Panels, hints" },
  { name: "Success", token: "bg-success", note: "Checked in only" },
  { name: "Warning", token: "bg-warning", note: "Use sparingly" },
  { name: "Destructive", token: "bg-destructive", note: "Errors" },
];

const TYPE_SCALE = [
  { label: "Display", className: "font-heading text-6xl font-semibold leading-none" },
  { label: "Heading 1", className: "font-heading text-4xl font-semibold" },
  { label: "Heading 2", className: "font-heading text-2xl font-semibold" },
  { label: "Heading 3", className: "font-heading text-lg font-semibold" },
  { label: "Body", className: "text-base" },
  { label: "Small", className: "text-sm text-muted-foreground" },
];

export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-16 px-5 py-12 sm:px-8">
      <header className="space-y-3">
        <Logo />
        <h1 className="text-4xl font-semibold">Design system</h1>
        <p className="max-w-prose text-muted-foreground">
          Clean and premium, built on ocean blue. Use these tokens and components for every screen.
          Toggle your OS theme to check dark mode.
        </p>
      </header>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COLORS.map((c) => (
            <div key={c.name} className="space-y-2">
              <div className={`h-20 rounded-xl border ${c.token}`} />
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <p className="text-sm text-muted-foreground">
          Bricolage Grotesque for headings, Geist for everything else.
        </p>
        <div className="space-y-5">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-baseline">
              <span className="text-sm text-muted-foreground">{t.label}</span>
              <span className={t.className}>Walk in. You&apos;re counted.</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-8">
          <Logo />
          <ChurchMark size={72} />
          <ChurchMark size={48} />
        </div>
        <p className="text-sm text-muted-foreground">
          The RCCG badge is the mark. Use it as supplied: never crop, recolour or stretch it, and
          keep it on calm backgrounds. The favicon and install icons are generated from the same
          master with <code className="font-mono">npm run icons</code>.
        </p>
        <PulseLine
          beats={[true, true, false, true, false, false, true, true]}
          className="text-primary"
        />
        <p className="text-sm text-muted-foreground">
          The pulse line shows an attendance record: a beat for every Sunday attended, flat for a
          miss. It is the one place the brand gets expressive.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Check in</Button>
          <Button variant="secondary">Scan QR instead</Button>
          <Button variant="outline">View history</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Remove member</Button>
          <Button disabled>Checking in…</Button>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="sg-email">Email</Label>
          <Input id="sg-email" type="email" placeholder="you@example.com" />
          <p className="text-sm text-muted-foreground">We&apos;ll send you a 6-digit code.</p>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span className="flex items-center gap-2">
            <StatusDot /> Service open
          </span>
          <span className="flex items-center gap-2">
            <StatusDot tone="idle" /> No service right now
          </span>
          <span className="flex items-center gap-2">
            <StatusDot tone="warning" pulsing={false} /> Weak GPS signal
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Admin</Badge>
          <Badge variant="secondary">Member</Badge>
          <Badge variant="outline">Excused</Badge>
          <Badge variant="destructive">3 Sundays missed</Badge>
          <Badge className="bg-success text-success-foreground">Checked in</Badge>
        </div>
      </Section>

      <Section title="Cards and loading">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>This Sunday</CardTitle>
              <CardDescription>Live count while check-in is open</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="tabular font-heading text-5xl font-semibold">42</p>
              <p className="text-sm text-muted-foreground">of 58 members</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-12 w-20" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <h2 className="border-b pb-3 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
