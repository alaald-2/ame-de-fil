import { Injectable } from "@nestjs/common";
import type { RateLimitHit, RateLimitStore } from "./rate-limit-store.js";

// Correct for a single process; a multi-instance deployment needs the
// Valkey-backed store instead (see rate-limit-store.ts) so limits are shared
// across instances — fine as the Phase 1 working default.
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, RateLimitHit>();

  increment(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    const existing = this.hits.get(key);

    if (!existing || existing.resetAt <= now) {
      const entry: RateLimitHit = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, entry);
      return entry;
    }

    existing.count += 1;
    return existing;
  }
}
