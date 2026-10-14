"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

type AuthError = { code?: string; status?: number } | null;

function sendErrorMessage(error: NonNullable<AuthError>): string {
  if (error.status === 429) return "Too many requests. Wait a minute, then try again.";
  if (error.code === "INVALID_EMAIL") return "That doesn't look like an email address.";
  return "We couldn't send a code. Check your connection and try again.";
}

function verifyErrorMessage(error: NonNullable<AuthError>): string {
  switch (error.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check the email and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong codes. Send a new one.";
  }
  if (error.status === 403) return "This account is inactive. Ask a youth leader for help.";
  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  return "We couldn't sign you in. Check your connection and try again.";
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  const sendCode = () =>
    startTransition(async () => {
      setError(null);
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });
      if (error) {
        setError(sendErrorMessage(error));
        return;
      }
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });

  // `pending` lags a render behind, so autofill + submit in one tick could verify twice
  // (the second call would burn an attempt). This ref blocks the overlap synchronously.
  const verifying = useRef(false);

  const verify = (otp: string) => {
    if (verifying.current) return;
    verifying.current = true;
    startTransition(async () => {
      setError(null);
      const { data, error } = await authClient.signIn.emailOtp({ email: email.trim(), otp });
      if (error || !data) {
        verifying.current = false;
        setError(verifyErrorMessage(error ?? {}));
        if (error?.code === "INVALID_OTP") setCode("");
        return;
      }
      // verifying stays true: we're leaving this page.
      router.replace(next ?? (data.user.role === "admin" ? "/admin" : "/"));
      router.refresh();
    });
  };

  if (step === "email") {
    return (
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          sendCode();
        }}
      >
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">Sign in</h1>
          <p className="text-muted-foreground">
            Use the email your youth leader added you with. We&apos;ll send you a 6-digit code.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="h-12 rounded-xl px-4 text-base"
          />
        </div>

        <FormError message={error} />

        <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl text-base">
          {pending ? "Sending code…" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === CODE_LENGTH) verify(code);
      }}
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a code to{" "}
          <span className="font-medium [overflow-wrap:anywhere] text-foreground">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">Sign-in code</Label>
        <Input
          ref={codeInput}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          required
          // Read-only (not disabled) while checking, so the phone keyboard stays open.
          readOnly={pending}
          value={code}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
            setCode(digits);
            if (digits.length === CODE_LENGTH) verify(digits);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error code-hint" : "code-hint"}
          className="tabular h-14 rounded-xl px-4 text-center font-mono text-2xl tracking-[0.5em]"
        />
        <p id="code-hint" className="text-sm text-muted-foreground">
          No email after a minute? Check your spam folder, or ask a youth leader to check
          you&apos;re on the list.
        </p>
      </div>

      <FormError message={error} />

      <Button
        type="submit"
        disabled={pending || code.length !== CODE_LENGTH}
        className="h-12 w-full rounded-xl text-base"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setStep("email");
            setError(null);
          }}
        >
          Use a different email
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending || cooldown > 0}
          onClick={sendCode}
          className="tabular"
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
      </div>
    </form>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      id="login-error"
      role="alert"
      className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
