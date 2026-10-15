import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ActiveToggle, MemberForm } from "@/components/admin/member-form";
import { HistoryList } from "@/components/member/history-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/dal";
import { getMember, getMemberHistory } from "@/lib/members";

export const metadata: Metadata = { title: "Member" };

export default function MemberPage({ params }: PageProps<"/admin/members/[id]">) {
  return (
    <div className="space-y-8">
      <Link
        href="/admin/members"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All members
      </Link>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <MemberDetail params={params} />
      </Suspense>
    </div>
  );
}

async function MemberDetail({ params }: Pick<PageProps<"/admin/members/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [member, history] = await Promise.all([getMember(id), getMemberHistory(id)]);
  if (!member) notFound();

  const joined = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(member.joinedAt);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {member.role === "admin" && <Badge variant="secondary">Leader</Badge>}
          {!member.isActive && <Badge variant="outline">Inactive</Badge>}
          {member.isFlagged && <Badge variant="destructive">Needs a follow-up</Badge>}
        </div>
        <h1 className="text-4xl font-semibold sm:text-5xl">{member.name || member.email}</h1>
        <p className="tabular text-muted-foreground">
          Joined {joined}
          {member.role === "member" && `, missed ${member.consecutiveAbsences} in a row`}
          {member.emailNotifications ? "" : ", emails off"}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[24rem_1fr]">
        <section className="space-y-6" aria-labelledby="details">
          <h2 id="details" className="text-xl font-semibold">
            Details
          </h2>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <MemberForm
              mode="edit"
              memberId={member.id}
              initial={{
                name: member.name,
                email: member.email,
                phone: member.phone ?? "",
                role: member.role,
              }}
            />
          </div>
          <ActiveToggle memberId={member.id} isActive={member.isActive} />
        </section>

        <section className="space-y-3" aria-labelledby="history">
          <h2 id="history" className="text-xl font-semibold">
            Sundays
          </h2>
          <HistoryList entries={history} />
        </section>
      </div>
    </div>
  );
}
