import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { CheckinPreview, DEMO_BEATS } from "@/components/brand/checkin-preview";
import { Logo } from "@/components/brand/logo";
import { PulseLine } from "@/components/brand/pulse-line";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/dal";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header>
          <Logo />
        </header>

        <main className="flex flex-1 items-center py-12">
          <div className="w-full max-w-sm">
            <Suspense fallback={<FormSkeleton />}>
              <LoginGate searchParams={searchParams} />
            </Suspense>
          </div>
        </main>

        <footer className="max-w-sm text-sm text-muted-foreground">
          Pulse uses your location only to confirm you&apos;re at church, and deletes it
          automatically after a short retention period.
        </footer>
      </div>

      <aside
        aria-hidden
        className="hidden flex-col justify-center gap-14 overflow-hidden bg-secondary px-14 py-16 lg:flex"
      >
        <div>
          <p className="max-w-md font-heading text-[clamp(2.5rem,4vw,3.75rem)] leading-[0.95] font-semibold tracking-tight text-secondary-foreground">
            Walk in.
            <br />
            You&apos;re counted.
          </p>
        </div>
        <CheckinPreview />
        <PulseLine beats={DEMO_BEATS} className="-mr-14 text-primary" />
      </aside>
    </div>
  );
}

/** Signed-in visitors skip the form; everyone else gets it. */
async function LoginGate({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  let target = safeRedirectPath(typeof next === "string" ? next : null, "");
  // Never bounce a signed-in user back to /login (that would loop).
  if (target === "/login" || target.startsWith("/login?") || target.startsWith("/login/")) {
    target = "";
  }
  const user = await getSessionUser();
  if (user) redirect(target || (user.role === "admin" ? "/admin" : "/"));
  return <LoginForm next={target || null} />;
}

function FormSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
