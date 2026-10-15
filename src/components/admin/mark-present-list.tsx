"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson } from "@/lib/api-client";

type Member = { userId: string; name: string; email: string };

type Props = { sessionId: string; members: Member[]; canMark: boolean };

/** Members not checked in yet, with a search box and "Mark present" (manual check-in). */
export function MarkPresentList({ sessionId, members, canMark }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    : members;

  const mark = (member: Member) => {
    setPendingId(member.userId);
    startTransition(async () => {
      const problem = await sendJson("/api/admin/attendance", "POST", {
        sessionId,
        userId: member.userId,
      });
      setPendingId(null);
      if (problem) {
        toast.error(problem);
        return;
      }
      toast.success(`${member.name} is marked present.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search members"
          placeholder="Search by name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded-xl pl-10 text-base"
        />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-6 text-center text-muted-foreground">
          {members.length === 0 ? "Everyone is accounted for." : "No one matches that search."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {shown.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.name}</p>
                <p className="truncate text-sm text-muted-foreground">{member.email}</p>
              </div>
              {canMark && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={() => mark(member)}
                >
                  {pendingId === member.userId ? "Marking…" : "Mark present"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
