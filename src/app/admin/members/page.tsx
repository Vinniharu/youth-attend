import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MembersToolbar } from "@/components/admin/members-toolbar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { requireAdmin } from "@/lib/dal";
import { listMembers } from "@/lib/members";

export const metadata: Metadata = { title: "Members" };

export default function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-semibold sm:text-5xl">Members</h1>
        <p className="text-muted-foreground">
          Everyone who can sign in to Pulse. Add people here, or import a list.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-11 rounded-xl" />}>
        <MembersToolbar />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <MemberList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MemberList({ searchParams }: Pick<PageProps<"/admin/members">, "searchParams">) {
  await requireAdmin();
  const { q } = await searchParams;
  const members = await listMembers(typeof q === "string" ? q.slice(0, 100) : "");

  if (members.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
        {q ? "No one matches that search." : "No members yet. Add someone or import a CSV."}
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
      {members.map((m) => (
        <li key={m.id}>
          <Link
            href={`/admin/members/${m.id}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted/60"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                <span className={m.isActive ? "" : "text-muted-foreground line-through"}>
                  {m.name || m.email}
                </span>
                {m.role === "admin" && <Badge variant="secondary">Leader</Badge>}
                {!m.isActive && <Badge variant="outline">Inactive</Badge>}
              </span>
              <span className="block truncate text-sm text-muted-foreground">{m.email}</span>
            </span>
            {m.isActive && m.role === "member" && (
              <span className="tabular flex items-center gap-2 text-sm text-muted-foreground">
                {m.isFlagged && <StatusDot tone="warning" pulsing={false} />}
                {m.consecutiveAbsences === 0
                  ? "No recent misses"
                  : `Missed ${m.consecutiveAbsences} in a row`}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
