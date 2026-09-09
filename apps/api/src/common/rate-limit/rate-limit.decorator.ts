import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

// Opt-in, per SECURITY.md §4's specific list (login, password reset,
// checkout submission, review submission, discount redemption) — not a
// blanket global limiter, which would wrongly throttle read-heavy catalog
// browsing at the same rate as sensitive write endpoints.
export const RateLimit = (options: RateLimitOptions): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);
