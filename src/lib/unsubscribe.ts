import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { appUrl } from "@/lib/config";

// One-click unsubscribe links in "we missed you" emails: /unsubscribe?u=<userId>&s=<sig>,
// sig = HMAC-SHA256(UNSUBSCRIBE_SECRET, "unsubscribe:<userId>"), first 16 bytes, base64url.
// No login needed (people read email anywhere); the signature makes the link
// unguessable and specific to one member.

function secret(): string {
  const value = process.env.UNSUBSCRIBE_SECRET;
  if (!value) throw new Error("UNSUBSCRIBE_SECRET is not set");
  return value;
}

const sign = (userId: string) =>
  createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest().subarray(0, 16);

export function unsubscribeUrl(userId: string): string {
  const url = new URL("/unsubscribe", appUrl());
  url.searchParams.set("u", userId);
  url.searchParams.set("s", sign(userId).toString("base64url"));
  return url.toString();
}

export function verifyUnsubscribe(userId: string, signature: string): boolean {
  const given = Buffer.from(signature, "base64url");
  const expected = sign(userId);
  return (
    given.length === expected.length &&
    given.toString("base64url") === signature &&
    timingSafeEqual(given, expected)
  );
}
