import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";

// Data access layer for auth. Every page and route handler that needs a user calls
// one of these itself; proxy.ts only does an optimistic cookie check.

export type Role = "member" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** A new self-registered account that hasn't added its name yet (see /welcome). */
  needsProfile: boolean;
};

/** The signed-in, active user, or null. Read from the database on every request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // disableRefresh: Server Components can't set cookies, so a refresh here would extend
  // the session in the database but not in the browser. <SessionKeepAlive /> refreshes
  // both through the /api/auth/get-session route handler instead.
  // Read headers first: it marks the request dynamic before auth is touched, so
  // prerendering never constructs Better Auth.
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  if (!result || result.user.isActive === false) return null;
  const { id, name, email, role } = result.user;
  return {
    id,
    name,
    email,
    role: role === "admin" ? "admin" : "member",
    needsProfile: name.trim() === "",
  };
});

// ---------------------------------------------------------------- pages

/**
 * For pages: the signed-in user, or a redirect to /login. A new account without a
 * name is sent to /welcome first (which passes `allowIncomplete`).
 */
export async function requireUser({ allowIncomplete = false } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.needsProfile && !allowIncomplete) redirect("/welcome");
  return user;
}

/** For admin pages: the signed-in admin. Members are sent home. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

// ---------------------------------------------------------------- route handlers

export type ApiAuth = { ok: true; user: SessionUser } | { ok: false; response: Response };

/**
 * For route handlers: 401 without a session, 403 if `role` is "admin" and the user
 * isn't one. Usage: `const auth = await authorizeApi("admin"); if (!auth.ok) return auth.response;`
 */
export async function authorizeApi(role: Role = "member"): Promise<ApiAuth> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
  if (role === "admin" && user.role !== "admin") {
    return { ok: false, response: Response.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { ok: true, user };
}
