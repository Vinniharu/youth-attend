import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { extractToken, isTokenShaped, scanUrl } from "@/lib/qr-link";
import { issueQrToken, parseQrToken, verifyQrToken } from "@/lib/qr-token";

const SESSION = "6f1c2b8a-3d4e-4f50-9a6b-7c8d9e0f1a2b";
const SECRET = randomBytes(32).toString("base64url");

const verify = (token: string, secret = SECRET) => verifyQrToken(parseQrToken(token)!, secret);

describe("issueQrToken", () => {
  it("is sessionId.base64url(HMAC-SHA256(secret, sessionId) first 16 bytes)", () => {
    const token = issueQrToken(SESSION, SECRET);
    const expectedSig = createHmac("sha256", SECRET)
      .update(SESSION)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
    expect(token).toBe(`${SESSION}.${expectedSig}`);
    expect(isTokenShaped(token)).toBe(true);
  });

  it("is fixed for the session: the same code all service", () => {
    expect(issueQrToken(SESSION, SECRET)).toBe(issueQrToken(SESSION, SECRET));
  });
});

describe("verifyQrToken", () => {
  const token = issueQrToken(SESSION, SECRET);

  it("accepts the session's code", () => {
    expect(verify(token)).toBe(true);
  });

  it("rejects tampering, another session, and a reset secret", () => {
    const [id, sig] = token.split(".");
    const flipped = `${sig!.startsWith("A") ? "B" : "A"}${sig!.slice(1)}`;
    expect(verify(`${id}.${flipped}`)).toBe(false);
    // The last character's 2 spare bits: same bytes, but not the canonical token.
    const last = sig!.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const respelled = `${sig!.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]}`;
    expect(Buffer.from(respelled, "base64url")).toEqual(Buffer.from(sig!, "base64url"));
    expect(parseQrToken(`${id}.${respelled}`)).toBeNull();
    const otherSession = "00000000-0000-4000-8000-000000000000";
    expect(verify(`${otherSession}.${sig}`)).toBe(false);
    // "Reset code" replaces the secret: every old copy stops verifying.
    expect(verify(token, randomBytes(32).toString("base64url"))).toBe(false);
  });
});

describe("parseQrToken / extractToken", () => {
  const token = issueQrToken(SESSION, SECRET);

  it.each([
    "",
    "nope",
    SESSION,
    `${SESSION}.12.${"a".repeat(22)}`, // the old rotating format
    `${SESSION}.${"a".repeat(21)}`,
    `bad.${"a".repeat(22)}`,
  ])("rejects malformed %j", (value) => {
    expect(parseQrToken(value)).toBeNull();
    expect(extractToken(value)).toBeNull();
  });

  it("reads a bare token or a Pulse scan link", () => {
    expect(extractToken(token)).toBe(token);
    expect(extractToken(` ${scanUrl("https://pulse.church.org", token)} `)).toBe(token);
  });

  it("ignores other links and other QR codes", () => {
    expect(extractToken(`https://evil.example/other?t=${token}`)).toBeNull();
    expect(extractToken("https://church.org/giving")).toBeNull();
    expect(extractToken("WIFI:S:Church;T:WPA;P:secret;;")).toBeNull();
  });
});
