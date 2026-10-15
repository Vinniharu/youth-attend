import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSender, sendEmail } from "@/lib/email";
import { firstName, greeting } from "@/lib/greeting";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/admin", "/history?week=3", "/admin/sessions/abc#top"])("keeps %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "admin",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/admin\\..\\evil",
    "/\tevil",
    "javascript:alert(1)",
  ])("rejects %j", (path) => {
    expect(safeRedirectPath(path, "/fallback")).toBe("/fallback");
  });
});

describe("parseSender", () => {
  it("parses a display name and address", () => {
    expect(parseSender('"Youth Church" <noreply@church.org>')).toEqual({
      name: "Youth Church",
      email: "noreply@church.org",
    });
    expect(parseSender("Youth Church <noreply@church.org>")).toEqual({
      name: "Youth Church",
      email: "noreply@church.org",
    });
  });

  it("accepts a bare address", () => {
    expect(parseSender("noreply@church.org")).toEqual({ email: "noreply@church.org" });
  });

  it("throws on a missing or invalid address", () => {
    expect(() => parseSender("")).toThrow(/EMAIL_FROM/);
    expect(() => parseSender("Youth Church <not-an-email>")).toThrow(/EMAIL_FROM/);
  });
});

describe("sendEmail (Resend)", () => {
  const message = {
    to: { email: "tobi@example.com" },
    subject: "Hi",
    html: "<p>Hi</p>",
    text: "Hi",
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips sending in development without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(message)).resolves.toEqual({ status: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run without an API key in production", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail(message)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("posts the message to Resend and returns its email id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", '"Youth Church" <noreply@church.org>');
    const fetchMock = vi.fn(async () => Response.json({ id: "49a3999c-0ce1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ ...message, tags: ["login-code"] })).resolves.toEqual({
      status: "sent",
      messageId: "49a3999c-0ce1",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Youth Church <noreply@church.org>",
      to: ["tobi@example.com"],
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      tags: [{ name: "category", value: "login-code" }],
    });
  });

  it("throws with Resend's error detail on failure", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_bad");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ name: "validation_error", message: "API key is invalid" }, { status: 401 }),
      ),
    );
    await expect(sendEmail(message)).rejects.toThrow(/Resend responded 401.*invalid/);
  });

  it("retries once when rate limited", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "retry-after": "0.01" } }))
      .mockResolvedValueOnce(Response.json({ id: "after-retry" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(message)).resolves.toEqual({
      status: "sent",
      messageId: "after-retry",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("greeting", () => {
  // 2026-10-14 is a Wednesday; Lagos is UTC+1 all year.
  it.each([
    ["2026-10-14T06:00:00Z", "Good morning"],
    ["2026-10-14T12:30:00Z", "Good afternoon"],
    ["2026-10-14T19:00:00Z", "Good evening"],
  ])("%s in Lagos is %s", (iso, expected) => {
    expect(greeting(new Date(iso), "Africa/Lagos")).toBe(expected);
  });

  it("takes the first name", () => {
    expect(firstName("  Tobi Adeyemi ")).toBe("Tobi");
    expect(firstName("Tobi")).toBe("Tobi");
  });
});
