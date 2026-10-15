"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/api-client";
import { newMemberInput } from "@/lib/schemas";

export type MemberFormValues = {
  name: string;
  email: string;
  phone: string;
  role: "member" | "admin";
};

type Props =
  | { mode: "create"; onDone?: () => void }
  | { mode: "edit"; memberId: string; initial: MemberFormValues; onDone?: () => void };

const MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: "Someone already uses that email.",
  SELF_CHANGE: "You can't remove your own admin access.",
};

/** Add or edit a member: name, email, phone, role. */
export function MemberForm(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<MemberFormValues>(
    props.mode === "edit" ? props.initial : { name: "", email: "", phone: "", role: "member" },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const parsed = newMemberInput.safeParse(values);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the details.");
        return;
      }
      const response = await fetch(
        props.mode === "create" ? "/api/admin/members" : `/api/admin/members/${props.memberId}`,
        {
          method: props.mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      ).catch(() => null);
      if (!response?.ok) {
        const { error: code } = ((await response?.json().catch(() => ({}))) ?? {}) as {
          error?: string;
        };
        setError((code && MESSAGES[code]) || "Couldn't save. Check your connection and try again.");
        return;
      }
      toast.success(props.mode === "create" ? `${parsed.data.name} added.` : "Saved.");
      if (props.mode === "create") {
        setValues({ name: "", email: "", phone: "", role: "member" });
      }
      props.onDone?.();
      router.refresh();
    });

  const field = (key: "name" | "email" | "phone") => ({
    id: `member-${key}`,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: event.target.value })),
    className: "h-11 rounded-xl px-3.5 text-base",
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="member-name">Full name</Label>
        <Input {...field("name")} autoComplete="off" required maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-email">Email</Label>
        <Input {...field("email")} type="email" autoComplete="off" required />
        <p className="text-sm text-muted-foreground">They sign in with a code sent here.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-phone">Phone (optional)</Label>
        <Input {...field("phone")} type="tel" autoComplete="off" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Role</legend>
        <div className="flex gap-2">
          {(["member", "admin"] as const).map((role) => (
            <label
              key={role}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm has-checked:border-primary has-checked:bg-secondary"
            >
              <input
                type="radio"
                name="role"
                value={role}
                checked={values.role === role}
                onChange={() => setValues((v) => ({ ...v, role }))}
                className="accent-primary"
              />
              {role === "member" ? "Member" : "Leader (admin)"}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-base">
        {pending ? "Saving…" : props.mode === "create" ? "Add member" : "Save changes"}
      </Button>
    </form>
  );
}

/** Deactivate or reactivate (a separate, deliberate action). */
export function ActiveToggle({ memberId, isActive }: { memberId: string; isActive: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const apply = () =>
    startTransition(async () => {
      const problem = await sendJson(`/api/admin/members/${memberId}`, "PATCH", {
        isActive: !isActive,
      });
      if (problem) {
        toast.error(problem);
        return;
      }
      toast.success(isActive ? "Member deactivated." : "Member reactivated.");
      setConfirm(false);
      router.refresh();
    });

  if (!isActive) {
    return (
      <Button variant="outline" disabled={pending} onClick={apply}>
        Reactivate
      </Button>
    );
  }
  return confirm ? (
    <div className="space-y-3">
      <p className="text-sm">
        Deactivate them? They&apos;re signed out, can&apos;t sign in, and stop counting towards
        attendance. Their history is kept.
      </p>
      <div className="flex gap-2">
        <Button variant="destructive" disabled={pending} onClick={apply}>
          Deactivate
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(false)}>
          Keep active
        </Button>
      </div>
    </div>
  ) : (
    <Button
      variant="ghost"
      className="text-destructive hover:text-destructive"
      onClick={() => setConfirm(true)}
    >
      Deactivate member
    </Button>
  );
}
