import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { extractToken, isTokenShaped, scanUrl } from "@/lib/qr-link";
import { issueQrToken, parseQrToken, qrWindowAt, verifyQrToken } from "@/lib/qr-token";

const SESSION = "6f1c2b8a-3d4e-4f50-9a6b-7c8d9e0f1a2b";
const SECRET = randomBytes(32).toString("base64url");
const W = 30;
const at = (seconds: number) => new Date(seconds * 1000);

const verifyAt = (token: string, seconds: number, secret = SECRET) =>
  verifyQrToken(parseQrToken(token)!, secret, at(seconds), W);

describe("issueQrToken", () => {
  it("follows the spec: sessionId.window.base64url(HMAC-SHA256 first 16 bytes)", () => {
    const { token, window, expiresAt } = issueQrToken(SESSION, SECRET, at(1_000_015), W);
    expect(window).toBe(Math.floor(1_000_015 / 30));
    const expectedSig = createHmac("sha256", SECRET)
      .update(`${SESSION}.${window}`)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
    expect(token).toBe(`${SESSION}.${window}.${expectedSig}`);
    expect(expiresAt.getTime()).toBe((window + 1) * 30_000);
    expect(isTokenShaped(token)).toBe(true);
  });
});

describe("verifyQrToken", () => {
  // A token shown at the very start of its window lives longest: ~60 s.
  const start = 33_333 * 30;
  const { token } = issueQrToken(SESSION, SECRET, at(start), W);

  it("accepts the current and the previous window", () => {
    expect(verifyAt(token, start)).toBe("valid");
    expect(verifyAt(token, start + 29)).toBe("valid");
    expect(verifyAt(token, start + 30)).toBe("valid"); // next window: scan delay
    expect(verifyAt(token, start + 59)).toBe("valid");
  });

  it("expires a screenshot within about 60 seconds", () => {
    expect(verifyAt(token, start + 60)).toBe("expired");
    expect(verifyAt(token, start + 3600)).toBe("expired");
    // Worst case for a member: shown at the end of its window, dead 31 s later.
    const late = issueQrToken(SESSION, SECRET, at(start + 29), W).token;
    expect(verifyAt(late, start + 60)).toBe("expired");
  });

  it("rejects tampering, the wrong secret, and tokens from the future", () => {
    const [id, win, sig] = token.split(".");
    const flipped = `${sig!.startsWith("A") ? "B" : "A"}${sig!.slice(1)}`;
    expect(verifyAt(`${id}.${win}.${flipped}`, start)).toBe("invalid");
    // The last character's 2 spare bits: same bytes, but not the canonical token.
    const last = sig!.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const respelled = `${sig!.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]}`;
    expect(Buffer.from(respelled, "base64url")).toEqual(Buffer.from(sig!, "base64url"));
    expect(parseQrToken(`${id}.${win}.${respelled}`)).toBeNull();
    expect(verifyAt(`${id}.${Number(win) + 1}.${sig}`, start + 30)).toBe("invalid");
    const otherSession = "00000000-0000-4000-8000-000000000000";
    expect(verifyAt(`${otherSession}.${win}.${sig}`, start)).toBe("invalid");
    expect(verifyAt(token, start, randomBytes(32).toString("base64url"))).toBe("invalid");

    const future = issueQrToken(SESSION, SECRET, at(start + 90), W).token;
    expect(verifyAt(future, start)).toBe("invalid");
  });

  it("windows follow QR_WINDOW_SECONDS", () => {
    expect(qrWindowAt(at(59), 30)).toBe(1);
    expect(qrWindowAt(at(59), 60)).toBe(0);
  });
});

describe("parseQrToken / extractToken", () => {
  const { token } = issueQrToken(SESSION, SECRET, at(1_000_000), W);

  it.each([
    "",
    "nope",
    `${SESSION}.12`,
    `${SESSION}.x.${"a".repeat(22)}`,
    `bad.1.${"a".repeat(22)}`,
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
