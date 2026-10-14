"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/api-client";
import { createSessionInput } from "@/lib/schemas";

type Props = { defaultDate: string; defaultStart: string; defaultEnd: string };

export function CreateSessionForm({ defaultDate, defaultStart, defaultEnd }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    serviceDate: defaultDate,
    start: defaultStart,
    end: defaultEnd,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const parsed = createSessionInput.safeParse(form);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the date and times.");
        return;
      }
      const problem = await sendJson("/api/admin/sessions", "POST", parsed.data);
      if (problem) {
        setError(problem);
        return;
      }
      toast.success("Session created.");
      router.refresh();
    });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value })),
    className: "tabular h-11 rounded-xl px-3.5 text-base",
    required: true,
  });

  return (
    <form
      className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">New session</h2>
        <p className="text-sm text-muted-foreground">
          Uses the current church location. Times are church time.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="session-date">Date</Label>
        <Input id="session-date" type="date" {...field("serviceDate")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="session-start">Check-in opens</Label>
          <Input id="session-start" type="time" {...field("start")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-end">Closes</Label>
          <Input id="session-end" type="time" {...field("end")} />
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-base">
        {pending ? "Creating…" : "Create session"}
      </Button>
    </form>
  );
}
