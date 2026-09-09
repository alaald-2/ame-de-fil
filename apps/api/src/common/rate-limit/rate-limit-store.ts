export interface RateLimitHit {
  count: number;
  resetAt: number;
}

// Pluggable so a Valkey-backed store (DECISIONS.md ADR-012) can replace
// InMemoryRateLimitStore later without touching RateLimitGuard — not wired
// yet because there's no live Valkey in this environment to verify it
// against (same constraint as Postgres/Docker, disclosed in the checkpoint
// report rather than faked).
export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

export interface RateLimitStore {
  increment(key: string, windowMs: number): RateLimitHit | Promise<RateLimitHit>;
}
