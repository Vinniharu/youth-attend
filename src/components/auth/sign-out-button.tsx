"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const signOut = () =>
    startTransition(async () => {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error("Couldn't sign you out. Check your connection and try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    });

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={pending}>
      <LogOut aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
