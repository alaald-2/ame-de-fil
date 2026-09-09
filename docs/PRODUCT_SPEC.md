# Product Specification — Âme de Fil

This distills the business/product requirements from the founding brief into a reference spec. It is **not** a final PRD — items marked ❓ (see §6) are assumptions made to keep discovery moving and need your confirmation.

## 1. Brand & positioning

Premium handmade crochet goods. Brand voice: Scandinavian atelier simplicity — elegant, editorial, warm, artisanal, timeless. Explicitly **not**: Etsy-generic, childish craft-store, template-SaaS-looking. (Originally framed as "French atelier × Scandinavian simplicity"; narrowed to Scandinavian-only per your 2026-09-08 confirmation that French is removed entirely — `DESIGN_SYSTEM.md` §1, `DECISIONS.md` ADR-021.)

## 2. Markets & language — confirmed 2026-09-08 (ADR-021)

- **Market:** Sweden only. Shipping: Sweden only. Currency: SEK only. VAT: Swedish moms only.
- **Locales:** `sv-SE` (primary/default) and `en` (secondary, UI-only — not a separate market) across both `storefront` and `admin`.
- **French removed entirely** — no `fr-FR` locale, no French market/shipping/VAT scope, and the original brief's "French atelier" brand-voice framing is narrowed to Scandinavian-only (`DESIGN_SYSTEM.md` §1).

## 3. Product model (handmade commerce concepts, confirmed from the brief)

- **Ready-to-ship** vs. **made-to-order** (with a stated **production time**) — both flow through the same catalog/checkout model (`DATABASE.md` §1), differing in stock-tracking and fulfillment timeline.
- **Limited editions** — finite, non-replenished stock; pairs naturally with a back-in-stock/waitlist mechanic (`DATABASE.md` §2) since "sold out" is a frequent, expected state, not an error condition.
- Attributes: materials, colors, sizes, dimensions, care instructions, SKU, weight, stock, images, editorial story, collection membership.

## 4. Customer-facing scope (v1)

Browse (catalog, categories, collections) → search → filter → product detail → cart → checkout → payment (card, Klarna, Swish — via Stripe, ADR-014) → order confirmation → order history/account → reviews (browse + submit) → wishlist.

## 5. Admin scope (v1)

Dashboard (revenue/orders/customers/inventory/payment/alerts overview), Products (full lifecycle incl. variants/pricing/images/SEO), Orders (detail, payment/fulfillment status, refunds, notes), Inventory (stock, reservations, movements, low-stock alerts), Customers (profile, history, addresses, notes), Content (collections/categories/editorial), Administration (users/roles/permissions/audit log). Admin UI is bilingual, `sv-SE`/`en` (confirmed, ADR-021).

## 6. Assumed non-goals for v1 — ❓ confirm

Not in the brief's explicit scope; assumed **out of v1** unless you say otherwise, since building for them now would be speculative complexity the brief itself warns against:

- Multi-vendor/marketplace model (single brand/seller only).
- Native mobile app (responsive web only).
- Subscriptions/recurring billing.
- Gift cards / store credit (schema slot reserved, `DATABASE.md` §2, not built).
- B2B/wholesale ordering (separate pricing tiers, POs, net terms).
- BankID login — very common trust signal for Swedish e-commerce, genuinely worth considering, but adds a real integration surface; flagged as a launch-readiness candidate rather than assumed v1 (`ROADMAP.md`).

## 7. Success criteria (engineering-observable, for the phases that build them)

- Storefront Core Web Vitals targets met (`SEO.md` §7).
- WCAG 2.2 AA verified (`DESIGN_SYSTEM.md` §7).
- Zero known race condition allowing oversell under concurrent checkout load (`DATABASE.md` §4, tested per `TESTING.md` §3).
- No payment ever confirmed without a verified webhook (`PAYMENTS.md` §4).
