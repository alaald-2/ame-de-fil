# Security Architecture — Âme de Fil

This document is the architecture-level security design. For the vulnerability-disclosure policy, see the root `SECURITY.md`.

## 1. Authentication

- Hand-rolled, server-owned session auth in `apps/api` (ADR-015 — Lucia is deprecated, Auth.js is Next.js-shaped and would wrongly make the storefront an auth authority).
- Passwords hashed with **Argon2id** (memory-hard, current OWASP recommendation), never bcrypt/plain SHA.
- Sessions: opaque, cryptographically random tokens (not JWTs — revocability matters more than statelessness here: an admin must be able to kill a session instantly). Stored in Postgres (`Session` table), read-through cached in Valkey.
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax` (storefront/admin) — `SameSite=Strict` is not used because it breaks cross-site payment-redirect flows (Klarna/Swish return navigation).
- MFA: schema-ready (TOTP secret column) from day one; not enabled in v1 UI. Strongly recommended for `admin` before launch — flagged in `ROADMAP.md`.
- Rate-limited login attempts (see §4) and generic error messages (never reveal whether the email exists).

## 2. Authorization (RBAC)

- `User` ⇄ `Role` ⇄ `Permission`, many-to-many, evaluated in a Nest **guard**, not scattered `if (user.isAdmin)` checks.
- Every admin-facing endpoint declares its required permission(s) via a decorator; the guard denies by default (allow-list, not deny-list).
- Storefront endpoints (cart, checkout, own-order lookup) enforce **object-level** authorization — a logged-in customer can only read/mutate their own cart/orders/addresses, checked against the session's `userId` on every request, never trusted from a route param alone (classic IDOR prevention: `/orders/:id` must verify `order.userId === session.userId` server-side, not just that `:id` is a valid order).
- Admin actions are additionally scoped — e.g. a "support" role can view orders and issue notes but not issue refunds or change RBAC itself.

## 3. CSRF

Because auth is cookie-based, state-changing requests need CSRF protection beyond `SameSite=Lax` alone (which only mitigates cross-site _top-level navigation_, not all vectors). Approach: double-submit token (a CSRF token issued on session creation, required as a custom header — `X-CSRF-Token` — on all mutating requests, verified server-side against the session). Webhook endpoints (Stripe) are explicitly exempt from CSRF (they're not cookie-authenticated — they're verified by signature, §6).

## 4. Rate limiting & abuse prevention

- A rate-limit guard, backed by Valkey once available, applied per-IP and per-account on: login, password reset, checkout submission, review submission, discount-code redemption (brute-forcing coupon codes is a real e-commerce abuse pattern). **Implementation note (Phase 1 API checkpoint):** `@nestjs/throttler`'s peer range (`@nestjs/common` `^7–^11`) doesn't cover Nest 12 yet (verified against npm) — a small hand-rolled `RateLimitGuard` + pluggable `RateLimitStore` interface was built instead (`apps/api/src/common/rate-limit/`), with an in-memory store as the Phase 1 default and a Valkey-backed store as a documented, not-yet-built extension point (no live Valkey to verify one against either). Revisit `@nestjs/throttler` once it supports Nest 12.
- Stricter limits on unauthenticated write endpoints than authenticated ones.
- CAPTCHA/challenge (e.g. on repeated failed logins) is a candidate hardening step pre-launch, not built in v1.

## 5. Input validation & injection prevention

- Every DTO validated at the Nest controller boundary (`class-validator`/Zod via `packages/validation` — ADR/`ARCHITECTURE.md` §2).
- **SQL injection:** Prisma's parameterized queries by default; raw SQL (if ever needed for a reporting query) must use Prisma's tagged-template `$queryRaw` (parameterized), never string concatenation.
- **XSS:** React's default JSX escaping covers most output; the one deliberate rich-text surface (editorial product story / care instructions) is sanitized server-side on write (allow-list HTML sanitizer, e.g. `sanitize-html`) rather than trusted on render — defense in depth.
- File uploads (product images, admin-side) are validated by content-type sniffing (not just extension) and re-encoded/resized server-side before storage, never served from the same origin as the app if avoidable (reduces stored-XSS-via-upload risk).

## 6. Webhook security

- **Implemented** (`apps/api/src/payments/`): every inbound Stripe webhook is verified via HMAC signature (`stripe.webhooks.constructEvent` with the endpoint's signing secret, against the raw untouched request body — `main.ts`'s `rawBody: true`) before any processing. A missing signature header or a failed verification returns `400` with no side effects, no `WebhookEvent` row written.
- `POST /api/v1/payments/webhooks/stripe` is `@Public()` + `@SkipCsrf()` (not cookie-authenticated, verified by signature instead, per §3) and carries no `@RequirePermissions` (there is no caller identity to hold one) and deliberately no rate limit (Stripe's own delivery cadence governs volume; per-IP throttling here risks dropping genuine retries during a delivery burst).
- Idempotent processing via the `WebhookEvent` ledger (`DATABASE.md` §2, `PAYMENTS.md` §5) — implemented, verified by unit tests covering duplicate-event-ID and already-terminal-Payment replay, not yet verified against real concurrent load (no live Postgres available in the checkpoint that built this — `DEPLOYMENT.md` §1).

## 7. Secrets management

- No secret ever committed to the repository. `.env.example` documents required variable _names_ only, with placeholder/empty values.
- `.gitignore` excludes all `.env*` except `.env.example` from day one.
- Runtime secrets (DB URL, Stripe secret key, webhook signing secret, session signing material) are injected via the deployment platform's secret store (exact platform pending — `DEPLOYMENT.md` §Open questions) — never baked into Docker images.
- Local dev secrets are developer-generated (`.env.local`, gitignored) or pulled from a team secret manager (1Password/Doppler) — not shared over chat/email.

## 8. Transport & headers

- HTTPS enforced everywhere (HSTS). Security headers (CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) set via Next.js middleware/`next.config` headers for `storefront`/`admin`, and Helmet for `apps/api`. **Implemented so far: `apps/storefront`'s CSP only** (`next.config.ts`, `headers()`), added alongside the Stripe integration since that's what first needed it — `apps/admin`'s headers and `apps/api`'s Helmet CSP (still explicitly disabled in `main.ts`) remain open gaps, unrelated to Stripe (the API serves JSON/Swagger, never renders Stripe.js).
- **`apps/storefront`'s CSP, as implemented:** `script-src 'self' 'unsafe-inline' https://js.stripe.com`, `frame-src https://js.stripe.com https://hooks.stripe.com`, `connect-src 'self' https://api.stripe.com <API origin>`, `style-src 'self' 'unsafe-inline'`. The `'unsafe-inline'` on `script-src` is a disclosed, verified-necessary trade-off, not a generic loosening: Next.js's own App Router injects unnonced inline hydration/RSC bootstrap scripts, and omitting it broke the app's own JS at runtime (checked live via Playwright, not assumed) — a stricter nonce-based CSP would avoid this but needs per-request middleware plumbing out of scope for the checkpoint that added this.
- CORS on `apps/api` is an explicit allow-list of the known `storefront`/`admin` origins — never a wildcard.

## 9. Audit logging

**Requirement:** every admin-privileged mutation (product publish/unpublish, price change, refund, role change, discount creation) is to write an `AuditLog` row: actor, action, target entity, before/after (where feasible), timestamp, IP. Audit logs are append-only (no update/delete path exposed, even to admins) and excluded from the standard data-retention/erasure flow for the retention period required by financial record-keeping law (distinct from marketing-data GDPR erasure, §10).

**Implemented so far: none.** The `AuditLog` Prisma model exists (`DATABASE.md`) and `apps/api/src/audit/audit.module.ts` is registered in `AppModule`, but it's an empty module — no admin mutation (`admin/products`, `admin/inventory`, `admin/orders`, `admin/checkout`) writes to it yet. Until this ships, the "audited role changes" mitigation §11's threat table lists against privilege escalation is a design intent, not an active control. Wiring `AuditLog` writes into the admin mutations that already exist is a small, self-contained next step — it needs no new admin UI.

## 10. GDPR-oriented design

- **Lawful basis & consent:** `ConsentRecord` (`DATABASE.md`) tracks cookie/marketing consent with a timestamp and policy version — re-prompted when the policy version changes.
- **Data minimization:** guest checkout is supported (no forced account creation) so browsing/purchase data isn't tied to a persistent identity unless the customer opts in.
- **Right to access/erasure:** `DataSubjectRequest` tracks export/erasure requests and their fulfillment; erasure of a `User` anonymizes PII on `Order`/`Review` rows rather than deleting them outright (financial records must be retained per Swedish bookkeeping law — `Bokföringslagen` requires 7 years), which is disclosed in the privacy policy.
- **Data residency:** EU/EEA hosting for the database and object storage is a hard requirement given `sv-SE` customer PII (Sweden-only market, confirmed — ADR-021) — factors into the deployment-target decision (`DEPLOYMENT.md` §Open questions).
- **Third-party processors:** Stripe, the email provider, and any analytics tool are all processors requiring a DPA — tracked at implementation/vendor-selection time, not now.

## 11. Threat summary table

| Threat                                            | Mitigation                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Client-supplied price/stock/discount trusted      | Server re-derives all totals from DB on every request (§ throughout `PAYMENTS.md`/`DATABASE.md`) |
| Session hijacking                                 | `httpOnly`/`Secure` cookies, session revocation, anomaly logging (IP/UA change)                  |
| CSRF                                              | Double-submit token on all cookie-authenticated mutations                                        |
| Brute force (login, coupons)                      | Per-IP/per-account rate limiting via Valkey-backed throttler                                     |
| SQL injection                                     | Prisma parameterized queries exclusively                                                         |
| Stored/reflected XSS                              | React escaping + server-side HTML sanitization on rich-text write path                           |
| Forged payment webhooks                           | HMAC signature verification, reject unsigned                                                     |
| Duplicate webhook double-processing               | `WebhookEvent` idempotency ledger                                                                |
| IDOR (accessing another customer's order/address) | Object-level authorization checked against session identity, not just route params               |
| Privilege escalation via admin bugs               | Default-deny RBAC guard, permission-scoped roles, audited role changes                           |
| Secret leakage                                    | No secrets in repo, platform secret store, `.env.example` only                                   |
| Chargebacks/disputes unhandled                    | Explicit `DISPUTED` payment state, admin-visible                                                 |
