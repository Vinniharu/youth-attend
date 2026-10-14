import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/dal";

// Admin pages block on the role check (a quick session lookup) before any admin
// markup renders, so a member receives none of it, only a redirect to "/" (a 307 in
// dev; in production the static root shell has already flushed, so it arrives as a
// 200 page carrying the redirect). Each admin page and API route still checks itself.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 py-6">
        <span className="flex items-center gap-3">
          <Link href="/admin" aria-label="Pulse admin home">
            <Logo />
          </Link>
          <Badge variant="secondary">Admin</Badge>
        </span>
        <AdminNav className="order-last -mx-1 w-full sm:order-none sm:mx-0 sm:w-auto" />
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="hidden rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Member view
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col pt-2 pb-20 lg:pt-6">{children}</main>
    </div>
  );
}
