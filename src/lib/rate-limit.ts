import "server-only";

/**
 * In-memory sliding-window rate limiter. Fine for the single app process this
 * deployment runs (one VPS); counts reset when the server restarts.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  /** Drops keys with no recent hits so the map can't grow without bound. */
  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(key);
    }
  };

  return {
    /** Records an attempt for `key`; `ok: false` once the limit is reached. */
    hit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
