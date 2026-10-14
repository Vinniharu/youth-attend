"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Slides the 60-day session: once per page load, asks Better Auth for the session
 * through its route handler, which extends it (at most daily) and re-sets the cookie.
 * Renders nothing; harmless when signed out.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    void authClient.getSession().catch(() => {});
  }, []);
  return null;
}
