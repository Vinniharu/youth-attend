import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/dal";

// Admin pages block on the role check (a quick session lookup) instead of streaming,
// so a member gets a real 307 to "/" and never receives any admin markup.
// Each admin page and admin API route still checks the role itself.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <span className="flex items-center gap-3">
          <Link href="/admin" aria-label="Pulse admin home">
            <Logo />
          </Link>
          <Badge variant="secondary">Admin</Badge>
        </span>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Member view
          </Link>
          <SignOutButton />
        </nav>
      </header>
      <main className="flex flex-1 flex-col pt-4 pb-20 lg:pt-10">{children}</main>
    </div>
  );
}
