import { afterEach, describe, expect, it, vi } from "vitest";

import { rejectUnlessCron } from "@/lib/cron";
import { BATCH_SIZE, sendEmailBatch } from "@/lib/email";
import { unsubscribeUrl, verifyUnsubscribe } from "@/lib/unsubscribe";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rejectUnlessCron", () => {
  const request = (authorization?: string) =>
    new Request("http://localhost/api/cron/open-close", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });

  it("allows only the exact bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(rejectUnlessCron(request("Bearer s3cret-value"))).toBeNull();
    expect(rejectUnlessCron(request("Bearer s3cret-valuE"))?.status).toBe(401);
    expect(rejectUnlessCron(request("s3cret-value"))?.status).toBe(401);
    expect(rejectUnlessCron(request())?.status).toBe(401);
  });

  it("refuses to run without a configured secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(rejectUnlessCron(request("Bearer "))?.status).toBe(503);
  });
});

describe("unsubscribe links", () => {
  const id = "6f1c2b8a-3d4e-4f50-9a6b-7c8d9e0f1a2b";

  it("signs a member-specific link that verifies", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "unsub-secret");
    vi.stubEnv("APP_URL", "https://pulse.church.org");
    const url = new URL(unsubscribeUrl(id));
    expect(url.origin + url.pathname).toBe("https://pulse.church.org/unsubscribe");
    expect(url.searchParams.get("u")).toBe(id);
    expect(verifyUnsubscribe(id, url.searchParams.get("s")!)).toBe(true);
  });

  it("rejects another member's id, a tampered signature, or another secret", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "unsub-secret");
    const s = new URL(unsubscribeUrl(id)).searchParams.get("s")!;
    expect(verifyUnsubscribe("00000000-0000-4000-8000-000000000000", s)).toBe(false);
    expect(verifyUnsubscribe(id, `${s.startsWith("A") ? "B" : "A"}${s.slice(1)}`)).toBe(false);
    vi.stubEnv("UNSUBSCRIBE_SECRET", "rotated");
    expect(verifyUnsubscribe(id, s)).toBe(false);
  });
});

describe("sendEmailBatch", () => {
  it("splits into Brevo requests of BATCH_SIZE and keeps message ids in order", async () => {
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    let n = 0;
    const brevo = vi.fn(async (_url: string, init: RequestInit) => {
      const { messageVersions } = JSON.parse(String(init.body)) as { messageVersions: unknown[] };
      return Response.json({ messageIds: messageVersions.map(() => `<${n++}>`) });
    });
    vi.stubGlobal("fetch", brevo);

    const versions = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({
      to: { email: `m${i}@example.com` },
      params: { firstName: `M${i}` },
    }));
    const result = await sendEmailBatch({ subject: "s", html: "h", text: "t", versions });

    expect(brevo).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: "sent",
      messageIds: versions.map((_, i) => `<${i}>`),
    });
  });

  it("fails loudly if Brevo returns fewer ids than recipients", async () => {
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ messageIds: ["<only-one>"] })),
    );
    await expect(
      sendEmailBatch({
        subject: "s",
        html: "h",
        text: "t",
        versions: [
          { to: { email: "a@example.com" }, params: {} },
          { to: { email: "b@example.com" }, params: {} },
        ],
      }),
    ).rejects.toThrow(/1 message ids for 2/);
  });
});
