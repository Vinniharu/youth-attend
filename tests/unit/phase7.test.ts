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
  const message = (i: number) => ({
    to: { email: `m${i}@example.com` },
    subject: `s${i}`,
    html: `h${i}`,
    text: `t${i}`,
  });

  it("splits into Resend batch requests of BATCH_SIZE and keeps ids in order", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_k");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    let n = 0;
    const resend = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.resend.com/emails/batch");
      const emails = JSON.parse(String(init.body)) as unknown[];
      return Response.json({ data: emails.map(() => ({ id: `id-${n++}` })) });
    });
    vi.stubGlobal("fetch", resend);

    const messages = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => message(i));
    const result = await sendEmailBatch(messages);

    expect(resend).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(resend.mock.calls[1]![1].body)) as { to: string[] }[];
    expect(second).toEqual([expect.objectContaining({ to: [`m${BATCH_SIZE}@example.com`] })]);
    expect(result).toEqual({ status: "sent", messageIds: messages.map((_, i) => `id-${i}`) });
  });

  it("fails loudly if Resend returns fewer ids than emails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_k");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [{ id: "only-one" }] })),
    );
    await expect(sendEmailBatch([message(0), message(1)])).rejects.toThrow(
      /1 email ids for 2 emails/,
    );
  });
});
