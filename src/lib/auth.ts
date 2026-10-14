import "server-only";

import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { render, toPlainText } from "react-email";

import { getDb } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { LoginCodeEmail } from "@/emails/login-code";
import { assertEmailConfig, sendEmail } from "@/lib/email";

export const OTP_EXPIRES_MINUTES = 10;
const SESSION_DAYS = 60;
const DAY = 60 * 60 * 24;

/** Comma-separated extra origins, e.g. the Docker or Playwright port in development. */
function trustedOrigins(): string[] {
  return [process.env.APP_URL, ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));
}

async function isActiveUser(where: { email: string } | { id: string }): Promise<boolean> {
  const [row] = await getDb()
    .select({ isActive: users.isActive })
    .from(users)
    .where("email" in where ? eq(users.email, where.email) : eq(users.id, where.id))
    .limit(1);
  return row?.isActive ?? false;
}

async function sendLoginCode(email: string, otp: string): Promise<void> {
  // Inactive members get no code, and the response looks the same either way.
  if (!(await isActiveUser({ email }))) return;

  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] sign-in code for ${email}: ${otp}`);
  }

  const html = await render(
    createElement(LoginCodeEmail, { code: otp, expiresInMinutes: OTP_EXPIRES_MINUTES }),
  );
  await sendEmail({
    to: { email },
    subject: `${otp} is your Pulse sign-in code`,
    html,
    text: toPlainText(html),
    tags: ["login-code"],
  });
}

function createAuth() {
  return betterAuth({
    appName: "Pulse",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { users, session, account, verification },
    }),
    advanced: {
      // users.id is a UUID with no database default; every auth table uses UUIDs.
      database: { generateId: () => randomUUID() },
    },
    user: {
      modelName: "users",
      additionalFields: {
        // input: false, so nobody can set these through Better Auth's endpoints
        // (e.g. POST /update-user with role: "admin").
        role: { type: "string", required: false, defaultValue: "member", input: false },
        isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    session: {
      expiresIn: SESSION_DAYS * DAY,
      updateAge: DAY, // sliding: refreshed at most once a day while in use
    },
    hooks: {
      // In production Better Auth runs the send hook in the background, so a throw
      // there can't fail the request. Check email config up front instead: the member
      // sees "couldn't send a code" rather than waiting for one that never comes.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/send-verification-otp") return;
        try {
          assertEmailConfig();
        } catch (error) {
          console.error("[auth] email is not configured", error);
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Email is unavailable" });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Deactivated members can't start a session, even with a valid code.
          before: async (data) => {
            if (!(await isActiveUser({ id: data.userId }))) {
              throw new APIError("FORBIDDEN", { message: "Account is inactive" });
            }
          },
        },
      },
    },
    plugins: [
      emailOTP({
        // Admins add members; an unknown email silently gets no code.
        disableSignUp: true,
        otpLength: 6,
        expiresIn: OTP_EXPIRES_MINUTES * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        // Not awaited, so response time doesn't reveal whether the email is registered.
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") return;
          void sendLoginCode(email, otp).catch((error: unknown) => {
            console.error("[auth] failed to send sign-in code", error);
          });
        },
      }),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Module-level (not globalThis like the DB pool) so dev hot reloads pick up config edits.
let auth: Auth | undefined;

/**
 * Returns the Better Auth instance, creating it on first use. Lazy so `next build`
 * can import routes without DATABASE_URL or BETTER_AUTH_SECRET.
 */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
