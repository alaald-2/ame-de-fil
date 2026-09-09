# Implementation Roadmap — Âme de Fil

Phase 0 is complete as of this document. **No implementation begins until you approve this discovery/architecture package.**

## Phase 0 — Discovery & Architecture ✅ (this phase)

Environment inspection, technology research against current documentation, architecture evaluation and decisions (`DECISIONS.md`), documentation foundation. No application code.

## Phase 1 — Foundations

Monorepo scaffold (pnpm + Turborepo, per `ARCHITECTURE.md` §2), shared tooling (`packages/eslint-config`, `packages/config`, TypeScript strict baseline), CI skeleton (lint/typecheck/build gates only — test stages come online as tests exist), Prisma schema draft from `DATABASE.md`, design tokens in `packages/ui`/Tailwind theme, auth core (sessions, RBAC skeleton) in `apps/api`. Resolve the Docker/WSL environment gap (`DEPLOYMENT.md` §1) before container-dependent work starts.

## Phase 2 — Catalog & storefront core

Product/variant/category/collection CRUD (API + admin minimal), storefront browse/search/filter/detail pages, `next-intl` locale routing live, SEO plumbing (`SEO.md`) wired from the start rather than retrofitted.

## Phase 3 — Cart & checkout (card payments)

Cart, inventory reservation flow (`DATABASE.md` §4), Stripe card Payment Intents integration, order creation, order/payment state machines, webhook handling + idempotency (`PAYMENTS.md`).

## Phase 4 — Klarna & Swish, fulfillment lifecycle

Klarna/Swish payment methods via Stripe (ADR-014), shipment tracking via `ManualShippingProvider` (admin-entered, carrier-agnostic — ADR-022), made-to-order production-time flow, transactional email (order confirmation, shipping notification), abandoned-checkout handling.

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
