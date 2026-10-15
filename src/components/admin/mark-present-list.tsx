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

/** Members not checked in yet: search, "Mark present" (manual check-in) or "Excuse". */
export function MarkPresentList({ sessionId, members, canMark }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [excusing, setExcusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    : members;

  const act = (member: Member, url: string, body: Record<string, unknown>, done: string) => {
    setPendingId(member.userId);
    startTransition(async () => {
      const problem = await sendJson(url, "POST", { sessionId, userId: member.userId, ...body });
      setPendingId(null);
      if (problem) {
        toast.error(problem);
        return;
      }
      setExcusing(null);
      setReason("");
      toast.success(done);
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
            <li key={member.userId} className="space-y-3 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{member.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                </div>
                {canMark && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingId !== null}
                      onClick={() => setExcusing(excusing === member.userId ? null : member.userId)}
                    >
                      Excuse
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingId !== null}
                      onClick={() =>
                        act(
                          member,
                          "/api/admin/attendance",
                          {},
                          `${member.name} is marked present.`,
                        )
                      }
                    >
                      {pendingId === member.userId ? "Saving…" : "Mark present"}
                    </Button>
                  </div>
                )}
              </div>
              {excusing === member.userId && (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    act(
                      member,
                      "/api/admin/excusals",
                      reason.trim() ? { reason: reason.trim() } : {},
                      `${member.name} is excused.`,
                    );
                  }}
                >
                  <Input
                    aria-label={`Reason ${member.name} is excused`}
                    placeholder="Reason (optional), e.g. travelling"
                    value={reason}
                    maxLength={200}
                    onChange={(event) => setReason(event.target.value)}
                    className="h-9 rounded-lg"
                  />
                  <Button type="submit" size="sm" disabled={pendingId !== null}>
                    Excuse
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Undo an excusal (session page, "Excused" list). */
export function RemoveExcusalButton({
  sessionId,
  userId,
  name,
}: {
  sessionId: string;
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const problem = await sendJson("/api/admin/excusals", "DELETE", { sessionId, userId });
          if (problem) {
            toast.error(problem);
            return;
          }
          toast.success(`${name} is no longer excused.`);
          router.refresh();
        })
      }
    >
      Remove
    </Button>
  );
}
