# Implementation Roadmap — Âme de Fil

Phase 0 is complete as of this document. **No implementation begins until you approve this discovery/architecture package.**

## Phase 0 — Discovery & Architecture ✅ (this phase)

Environment inspection, technology research against current documentation, architecture evaluation and decisions (`DECISIONS.md`), documentation foundation. No application code.

## Phase 1 — Foundations

Monorepo scaffold (pnpm + Turborepo, per `ARCHITECTURE.md` §2), shared tooling (`packages/eslint-config`, `packages/config`, TypeScript strict baseline), CI skeleton (lint/typecheck/build gates only — test stages come online as tests exist), Prisma schema draft from `DATABASE.md`, design tokens in `packages/ui`/Tailwind theme, auth core (sessions, RBAC skeleton) in `apps/api`. Resolve the Docker/WSL environment gap (`DEPLOYMENT.md` §1) before container-dependent work starts.

## Phase 2 — Catalog & storefront core

Product/variant/category/collection CRUD (API + admin minimal), storefront browse/search/filter/detail pages, `next-intl` locale routing live, SEO plumbing (`SEO.md`) wired from the start rather than retrofitted.

## Phase 3 — Cart & checkout (card payments) ✅ complete

Cart, inventory reservation flow (`DATABASE.md` §4), Stripe card Payment Intents integration, order creation, order/payment state machines, webhook handling + idempotency (`PAYMENTS.md`).

**Implemented and committed** (`97f13d7`, 2026-09-09): cart and inventory reservation were already in place from an earlier checkpoint; this pass added `StripePaymentProvider` (card, automatic capture), the signed/idempotent `POST /api/v1/payments/webhooks/stripe` handler, the full succeeded/failed/canceled state-transition matrix including the race-safe `PAYMENT_SUCCEEDED_STOCK_LOST` path, and the guest-safe `GET /api/v1/orders/:orderId/status` polling endpoint (`OrderStatusToken` — hashed, order-scoped, time-limited) the storefront uses instead of trusting the browser redirect. 252 API unit tests pass; lint/typecheck/build are clean across all packages with no Stripe credentials present (`DECISIONS.md` ADR-024).

**Also implemented and committed since** (`DECISIONS.md` ADR-025): `ReservationExpiryScheduler`, an `@nestjs/schedule`-backed periodic sweep (default every 60s, `RESERVATION_EXPIRY_SWEEP_INTERVAL_MS`) that automatically calls the already-idempotent `ReservationExpiryService.releaseExpiredReservations()` — closing the "reservation expiry has no scheduler" gap this section previously listed. 257 API unit tests pass (5 new, covering interval registration, tick-driven sweeps under fake timers, and failure isolation).

**Verified and committed since (`2658b6a`, `DECISIONS.md` ADR-026):** the WSL/Docker environment gap (`DEPLOYMENT.md` §1) was resolved, and the full checkout → PaymentIntent → webhook → state-transition flow was run live against a real local Postgres and real Stripe test-mode credentials — surfacing and fixing two defects invisible under mocks (a Prisma create-payload/schema field mismatch; a P2002-duplicate-key detection helper written against the wrong Prisma query-engine's error shape) before finding and fixing a third, the reservation-expiry-vs-payment-success race (`PAYMENTS.md` §4a). This closed all four items previously listed here as blocking:

- ~~No live Stripe test-mode E2E run~~ — done: successful/failed/canceled payments, server-authoritative amounts, signature verification and rejection, replay idempotency (including under genuine concurrent duplicate delivery), and guest order-status token authorization all verified live.
- ~~`OrderStatusToken` migration not applied against a live Postgres~~ — done: `prisma migrate deploy` run against a real local instance (`docker-compose.yml`).
- ~~No Testcontainers integration tests for the webhook-vs-reservation-expiry race~~ — done: `apps/api/src/checkout/reservation-expiry-race.integration.spec.ts` and `checkout-flow.integration.spec.ts` (new `pnpm --filter @ame-de-fil/api test:integration`, `TESTING.md` §3) cover idempotent reservation release, webhook replay idempotency, the sweep-vs-late-webhook race (sequential and genuinely concurrent via `Promise.all`), and a full real-Postgres `CheckoutService.initiate()` run — the last of these is a standing regression test for the schema-mismatch defect found here, since it would have caught it automatically.
- ~~Scheduler's sweep behavior against a live database not observed end-to-end~~ — done: observed live, including the reservation-expiry-vs-payment-success race actually occurring in real time.

Klarna/Swish (ADR-014's eventual scope for this same Stripe integration) remain unbuilt — Phase 4.

## Phase 4 — Klarna & Swish, fulfillment lifecycle 🟡 in progress

Klarna/Swish payment methods via Stripe (ADR-014), shipment tracking via `ManualShippingProvider` (admin-entered, carrier-agnostic — ADR-022), made-to-order production-time flow, transactional email (order confirmation, shipping notification), abandoned-checkout handling.

**Klarna: implemented and verified live** (`DECISIONS.md` ADR-028) — `StripePaymentProvider` now offers `card`+`klarna` via an explicit `payment_method_types` list (matching ADR-014, not the prior `automatic_payment_methods` config). A real checkout through Klarna's actual test-mode sandbox redirect/confirmation flow was run end-to-end, confirming correct order/payment state transitions, inventory movement, and the storefront's existing Payment Element rendering Klarna with no frontend code change needed. `Payment.method` (previously unpopulated) now records which method was actually used, via a new `charge.succeeded` webhook handler.

**Swish: blocked, not a code gap.** Verified live that this Stripe account's Dashboard has not activated Swish — Stripe's API rejects it outright (`"not activated in your dashboard"`), a bank-linked Swedish payment method likely requiring Stripe's own approval. The code is ready: adding `"swish"` to `ENABLED_PAYMENT_METHOD_TYPES` (`stripe-payment.provider.ts`) is the only change needed once activated — no other code, webhook, or frontend work required, since the same generic Stripe PaymentIntents/webhook/Payment Element path already handles it identically to Klarna.

**Shipment tracking: implemented** (`DECISIONS.md` ADR-029) — admin endpoints for `CONFIRMED → READY_TO_SHIP → SHIPPED → DELIVERED`, with carrier name/tracking number recorded on `Shipment` (`ManualShippingProvider`'s admin-entered model, ADR-022). The `IN_PRODUCTION` branch for made-to-order items is deliberately not built here — see the next item — and there's no admin UI yet (Phase 5's "order management" scope will call these endpoints).

Made-to-order production-time flow, transactional email, and abandoned-checkout handling remain unbuilt.

## Phase 5 — Admin dashboard

Full admin scope from `PRODUCT_SPEC.md` §5: dashboard metrics, order management (incl. refunds), inventory management (reservations/movements/low-stock alerts), customer management, RBAC/user administration, audit log viewer.

## Phase 6 — Reviews, discounts, editorial, wishlist

Product reviews (with moderation — ❓ confirm verified-purchase-only policy), discount/coupon engine, editorial/content management for collections, wishlist, back-in-stock notifications.

## Phase 7 — Hardening & launch readiness

Full security review (`SECURITY.md` threat table re-verified against actual implementation), load testing focused on the inventory-reservation race path, full WCAG 2.2 AA audit (automated + manual), Playwright E2E suite complete across all critical flows and locales, GDPR data-subject-request flow verified end-to-end, payment reconciliation job verified against real Stripe test-mode data over time.

## Phase 8 — Post-launch candidates (not scoped, for awareness)

Gift cards/store credit, BankID login, wholesale/B2B, subscriptions, native mobile app, personalization/recommendations, advanced analytics — none built unless/until prioritized.

---

**Resolved 2026-09-08:** market/locale scope (Sweden-only, `sv-SE`+`en`, SEK-only — ADR-021) and payment-integration scope (Stripe-unified Klarna/Swish — ADR-014) are now confirmed and reflected throughout `docs/`.

**Still deferred, by your explicit choice:** deployment target (ADR-020), image storage vendor, email vendor, and shipping carrier — PostNord/DHL/Bring/other (ADR-022). None of these block starting the Prisma schema draft or monorepo scaffold; `ShippingProvider`'s v1 `ManualShippingProvider` needs no carrier chosen. They block finalizing the env-var schema and containerization specifics, and — for the carrier specifically — nothing until a real `ShippingProvider` adapter is built (post-v1).
