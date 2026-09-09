import { z } from "zod";

// `KEY=` (present, empty) is a common, deliberate ".env.example placeholder
// left blank" pattern (see apps/api/.env.example) — distinct from KEY being
// absent entirely, but a plain `.optional()` only tolerates the latter
// (`undefined`), not an empty string, which still fails `.min(1)`. This
// normalizes both to "not configured" before the min-length check runs, so
// a genuinely blank placeholder boots cleanly instead of hard-failing.
function optionalSecret() {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  );
}

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

  // Guest order-status polling credential lifetime (PAYMENTS.md §4,
  // DECISIONS.md ADR-024) — long enough to cover a slow redirect-based 3DS
  // confirmation plus a reasonable polling/retry window, short enough to
  // meaningfully limit exposure of a bearer token versus "forever".
  ORDER_STATUS_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(2),

  // How often ReservationExpirySchedulerService sweeps for expired
  // StockReservations (DATABASE.md §4). Default (1 minute) is well under
  // the 15-minute reservation TTL, bounding how long an already-expired
  // reservation can sit un-released before the next sweep catches it.
  RESERVATION_EXPIRY_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  // Stripe (PAYMENTS.md, DECISIONS.md ADR-014/ADR-024) — both optional at
  // the schema level: unset means PaymentsModule falls back to
  // PendingPaymentProvider (no real processor), matching this project's
  // existing "disclosed rather than faked" posture for infra gaps (Docker/
  // live Postgres). Required together in practice — a secret key with no
  // webhook secret can create charges but can never confirm them, which
  // PaymentsModule's factory validates at boot.
  STRIPE_SECRET_KEY: optionalSecret(),
  STRIPE_WEBHOOK_SECRET: optionalSecret(),

  // Transactional email (DECISIONS.md ADR-031) — generic SMTP, not a
  // vendor-specific integration; real vendor selection remains deferred
  // (ROADMAP.md Phase 4). Optional at the schema level: unset means
  // NotificationsModule falls back to PendingEmailProvider (no send
  // attempted), the same "disclosed rather than faked" posture as
  // STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET above. SMTP_PORT has no
  // default — Mailpit (docker-compose.yml) listens on 1025, not the
  // standard 587, so defaulting would silently point at the wrong port
  // for the one SMTP server this project actually ships a config for.
  SMTP_HOST: optionalSecret(),
  SMTP_PORT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  SMTP_FROM: optionalSecret(),

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
