import { z } from "zod";

// Structural defaults only (ports, TTLs, log level) — never a secret or a
// production value (SECURITY.md §7). DATABASE_URL and CORS origins have no
// default: they must be explicitly set, even in development.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),

  // Comma-separated explicit allow-list (SECURITY.md §8) — never a wildcard.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  SESSION_COOKIE_NAME: z.string().min(1).default("ame_session"),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 7),
  CSRF_COOKIE_NAME: z.string().min(1).default("ame_csrf"),
  // Guest cart identity — deliberately a *different* cookie from the session
  // cookie: an anonymous cart must keep working with no session at all, and
  // an authenticated request must ignore this entirely in favor of the
  // user's own persistent cart (Cart.userId) — never merged in this phase.
  CART_COOKIE_NAME: z.string().min(1).default("ame_cart"),
  CART_COOKIE_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Checkout §"Reservation lifetime: 15 minutes" — a config knob, not a
  // magic number, so ops can tune it without a code change if the business
  // requirement ever shifts.
  CHECKOUT_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  // How long a completed checkout's Idempotency-Key response stays
  // replayable — long enough to cover realistic client retries (a slow
  // network, a user re-submitting after a page reload) without keeping the
  // table growing forever.
  CHECKOUT_IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Cache/queue backing store (Valkey — DECISIONS.md ADR-012). Optional in
  // Phase 1: no live Valkey instance to validate against yet; rate-limit and
  // session-cache structures fall back to in-memory when unset.
  CACHE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
