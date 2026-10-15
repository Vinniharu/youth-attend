"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/api-client";
import { profileInput } from "@/lib/schemas";

type Props = {
  initial: { name: string; phone: string };
  /** "welcome": first step after sign-up (goes home when saved); "settings": edit in place. */
  mode: "welcome" | "settings";
};

/** A member's own name and phone. */
export function ProfileForm({ initial, mode }: Props) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const parsed = profileInput.safeParse(values);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check your details.");
        return;
      }
      const problem = await sendJson("/api/me/profile", "PATCH", parsed.data);
      if (problem) {
        setError(problem);
        return;
      }
      if (mode === "welcome") {
        router.replace("/");
        router.refresh();
      } else {
        toast.success("Details saved.");
        router.refresh();
      }
    });

  const field = (key: "name" | "phone") => ({
    id: `profile-${key}`,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: event.target.value })),
    className: "h-12 rounded-xl px-3.5 text-base",
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
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          {...field("name")}
          autoComplete="name"
          autoFocus={mode === "welcome"}
          required
          maxLength={100}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-phone">Phone (optional)</Label>
        <Input {...field("phone")} type="tel" autoComplete="tel" maxLength={30} />
        {mode === "welcome" && (
          <p className="text-sm text-muted-foreground">
            So a youth leader can reach you. Only leaders see it.
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl text-base">
        {pending ? "Saving…" : mode === "welcome" ? "Continue" : "Save details"}
      </Button>
    </form>
  );
}
