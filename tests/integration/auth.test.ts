import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { session, users, verification } from "@/db/schema";
import { getAuth } from "@/lib/auth";

import { insertUser, truncateAll } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Issues a code directly (server-only endpoint), bypassing email. */
const issueCode = (email: string) =>
  getAuth().api.createVerificationOTP({ body: { email, type: "sign-in" } });

/** Signs in with a code and returns the cookie header a browser would send back. */
async function signIn(email: string, otp?: string) {
  const code = otp ?? (await issueCode(email));
  const { headers, response } = await getAuth().api.signInEmailOTP({
    body: { email, otp: code },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, user: response.user };
}

/** Collects the codes the dev-console fallback prints, keyed by email. */
function captureLoggedCodes() {
  const codes = new Map<string, string>();
  vi.spyOn(console, "info").mockImplementation((message: unknown) => {
    const match = /sign-in code for (\S+): (\d{6})/.exec(String(message));
    if (match) codes.set(match[1]!, match[2]!);
  });
  return codes;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

beforeEach(truncateAll);
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe("email OTP sign-in", () => {
  it("sends an active member a code that signs them in with a year-long session", async () => {
    const member = await insertUser({ email: "tobi@example.com" });
    const codes = captureLoggedCodes();

    await getAuth().api.sendVerificationOTP({
      body: { email: "TOBI@example.com", type: "sign-in" },
    });
    await vi.waitFor(() => expect(codes.get("tobi@example.com")).toMatch(/^\d{6}$/));

    const { cookie, user } = await signIn("tobi@example.com", codes.get("tobi@example.com"));
    expect(user.id).toBe(member.id);

    const current = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    expect(current?.user).toMatchObject({ id: member.id, role: "member", isActive: true });
    expect(current!.session.id).toMatch(UUID);
    const days = (current!.session.expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThanOrEqual(365);
  });

  it("marks a seeded (unverified) member verified on first sign-in", async () => {
    const member = await insertUser({ emailVerified: false });
    await signIn(member.email);
    const [row] = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(row!.emailVerified).toBe(true);
  });

  it("stores codes hashed, never in plain text", async () => {
    const member = await insertUser();
    const code = await issueCode(member.email);
    const rows = await getDb().select().from(verification);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).not.toContain(code);
  });

  it("rejects a wrong code, then locks the code after 5 attempts", async () => {
    const member = await insertUser();
    const code = await issueCode(member.email);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      await expect(signIn(member.email, wrong)).rejects.toMatchObject({
        body: { code: "INVALID_OTP" },
      });
    }
    await expect(signIn(member.email, code)).rejects.toMatchObject({
      body: { code: "TOO_MANY_ATTEMPTS" },
    });
  });
});

describe("open sign-up", () => {
  it("sends a code to a new email; the first sign-in creates an active member", async () => {
    const codes = captureLoggedCodes();
    const result = await getAuth().api.sendVerificationOTP({
      body: { email: "New.Person@example.com", type: "sign-in" },
    });
    expect(result).toEqual({ success: true });
    await vi.waitFor(() => expect(codes.get("new.person@example.com")).toMatch(/^\d{6}$/));

    const before = Date.now();
    const { cookie, user } = await signIn(
      "new.person@example.com",
      codes.get("new.person@example.com"),
    );
    const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
    // No name yet: /welcome asks for it. Counting starts from now (joined_at).
    expect(row).toMatchObject({ name: "", role: "member", isActive: true, emailVerified: true });
    expect(row!.joinedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const current = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    expect(current?.user.id).toBe(user.id);
  });

  it("can't create an admin or an inactive account at sign-up", async () => {
    const email = "sneaky@example.com";
    const code = await issueCode(email);
    await getAuth()
      .api.signInEmailOTP({
        // What an attacker would POST: extra fields alongside the code.
        body: { email, otp: code, role: "admin", isActive: false } as never,
      })
      .catch(() => null);
    const rows = await getDb().select().from(users).where(eq(users.email, email));
    for (const row of rows) expect(row).toMatchObject({ role: "member", isActive: true });
  });

  it("caps codes per address so the form can't flood someone's inbox", async () => {
    const codes: string[] = [];
    vi.spyOn(console, "info").mockImplementation((message: unknown) => {
      if (String(message).includes("flood-target@example.com")) codes.push(String(message));
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 7; i++) {
      await getAuth().api.sendVerificationOTP({
        body: { email: "flood-target@example.com", type: "sign-in" },
      });
    }
    await settle();
    expect(codes).toHaveLength(5);
  });
});

describe("inactive members", () => {
  it("get no code", async () => {
    await insertUser({ email: "gone@example.com", isActive: false });
    const codes = captureLoggedCodes();
    await getAuth().api.sendVerificationOTP({
      body: { email: "gone@example.com", type: "sign-in" },
    });
    await settle();
    expect(codes.size).toBe(0);
  });

  it("can't start a session even with a valid code", async () => {
    const member = await insertUser({ isActive: false });
    await expect(signIn(member.email)).rejects.toMatchObject({ statusCode: 403 });
    expect(await getDb().select().from(session)).toHaveLength(0);
  });
});

describe("role safety", () => {
  it("won't let a member promote themselves through /update-user", async () => {
    const member = await insertUser();
    const { cookie } = await signIn(member.email);

    await expect(
      getAuth().api.updateUser({
        // Deliberately outside the typed input: this is what an attacker would POST.
        body: { role: "admin" } as never,
        headers: new Headers({ cookie }),
      }),
    ).rejects.toThrow();

    const [row] = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(row!.role).toBe("member");
  });

  it("reports an admin's role on their session", async () => {
    const admin = await insertUser({ role: "admin" });
    const { cookie } = await signIn(admin.email);
    const current = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    expect(current?.user.role).toBe("admin");
  });
});
