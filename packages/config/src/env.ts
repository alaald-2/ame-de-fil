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
  // Same purpose, a deliberately separate config value — an admin retrying
  // a refund action is a much shorter, more immediate UX interaction than
  // a customer's multi-hour cart-recovery window, so a much shorter
  // default is appropriate (admin-orders.service.ts's issueRefund).
  REFUND_IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(1),

  // Guest order-status polling credential lifetime (PAYMENTS.md §4,
  // DECISIONS.md ADR-024) — long enough to cover a slow redirect-based 3DS
  // confirmation plus a reasonable polling/retry window, short enough to
  // meaningfully limit exposure of a bearer token versus "forever".
  ORDER_STATUS_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(2),

  // AccountActionToken lifetimes (email verification / password reset).
  // Verification is loose since it's a low-severity, resendable action; a
  // password-reset token is deliberately much shorter-lived — it directly
  // authorizes taking over authentication for the account, so a smaller
  // exposure window matters far more than user convenience here.
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(1),

  // Email one-time-code login (DECISIONS.md ADR-036) — deliberately much
  // shorter than either token above: a code is meant to be typed within a
  // minute or two of arriving, not saved for later.
  LOGIN_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),

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

  // Google sign-in (DECISIONS.md ADR-033) — optional at the schema level:
  // unset (any of the three) means IdentityModule falls back to
  // PendingOAuthProvider, same "disclosed rather than faked" posture as
  // Stripe/SMTP above. All three are required together in practice,
  // checked in IdentityModule's factory rather than enforced here, mirroring
  // STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET's existing pattern exactly.
  GOOGLE_CLIENT_ID: optionalSecret(),
  GOOGLE_CLIENT_SECRET: optionalSecret(),
  GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),
  // Where a browser is sent after the Google round-trip completes (success
  // or failure) — a fixed, server-configured destination only, never a
  // client-supplied redirect target (that would be an open-redirect
  // vulnerability). No default: unlike a structural knob (a port, a TTL),
  // this is a real per-environment value in the same category
  // CORS_ALLOWED_ORIGINS already is, and a wrong default silently sending
  // a real user's session cookie to the wrong host in production is worse
  // than failing to boot the feature at all.
  STOREFRONT_BASE_URL: z.url().optional(),

  // Product image storage (DECISIONS.md ADR-034) — Cloudinary. Optional at
  // the schema level: unset means CatalogModule's image upload falls back
  // to PendingImageStorageProvider (a clear "not configured" error, not a
  // silent failure), the same "disclosed rather than faked" posture as
  // Stripe/SMTP/Google above. Required together in practice, checked in
  // the factory rather than enforced here.
  CLOUDINARY_CLOUD_NAME: optionalSecret(),
  CLOUDINARY_API_KEY: optionalSecret(),
  CLOUDINARY_API_SECRET: optionalSecret(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Cache/queue backing store (Valkey — DECISIONS.md ADR-012). Optional in
  // Phase 1: no live Valkey instance to validate against yet; rate-limit and
  // session-cache structures fall back to in-memory when unset.
  CACHE_URL: z.url().optional(),

  // Admin Tasks automation sweep (TaskAutomationScheduler) — how often the
  // read-only sweep re-derives Task rows from Order/InventoryItem/Refund/
  // Payment state, same "configurable, not a magic number" posture as
  // RESERVATION_EXPIRY_SWEEP_INTERVAL_MS. A slower default than that sweep
  // (5 minutes vs. 1) is fine here: task generation has no correctness
  // race to bound the way stock reservation does, only freshness.
  TASK_AUTOMATION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // A PENDING Refund with no terminal outcome yet (PAYMENTS.md §6's
  // disclosed "no async reconciliation" gap) becomes a
  // FOLLOW_UP_PENDING_REFUND task once it's been stuck this long.
  TASK_REFUND_PENDING_FOLLOWUP_HOURS: z.coerce.number().int().positive().default(24),
  // Due date offset for the CUSTOMER_FOLLOW_UP task generated after a
  // Refund reaches SUCCEEDED.
  TASK_REFUND_FOLLOWUP_DELAY_DAYS: z.coerce.number().int().positive().default(3),
  // How many days past its computed production due date an order sits in
  // IN_PRODUCTION/READY_TO_SHIP before a FOLLOW_UP_DELAYED_ORDER task is
  // generated.
  TASK_DELAYED_ORDER_GRACE_DAYS: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
