import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows `limit` hits per window, per key, then reports when to retry", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 300_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(limiter.hit("tobi", t0 + i * 1000).ok).toBe(true);

    const blocked = limiter.hit("tobi", t0 + 10_000);
    expect(blocked).toEqual({ ok: false, retryAfterMs: 290_000 });
    expect(limiter.hit("chiamaka", t0 + 10_000).ok).toBe(true); // other members unaffected
  });

  it("slides: the oldest hit expiring frees one slot", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.hit("k", 0);
    limiter.hit("k", 30_000);
    expect(limiter.hit("k", 59_999).ok).toBe(false);
    expect(limiter.hit("k", 60_000).ok).toBe(true);
    expect(limiter.hit("k", 60_001).ok).toBe(false);
  });

  it("doesn't count blocked attempts against the member", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    limiter.hit("k", 0);
    for (let t = 100; t < 1_000; t += 100) expect(limiter.hit("k", t).ok).toBe(false);
    expect(limiter.hit("k", 1_000).ok).toBe(true);
  });
});
