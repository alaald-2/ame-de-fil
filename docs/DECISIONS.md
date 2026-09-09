# Architecture Decision Record — Âme de Fil

Each entry follows: **Context → Decision → Alternatives considered → Consequences**.
Versions were verified against current documentation/release notes as of **2026-09-08**, targeting **Node.js 24 LTS** (installed locally: `v24.20.0`, npm `11.19.0`, pnpm `12.3.4`).

Status legend: ✅ Decided · 🟡 Decided, revisit at scale · ❓ Needs product input (see `ROADMAP.md` and `PRODUCT_SPEC.md` §6 for the open items)

---

## ADR-001: Package manager — pnpm ✅

**Decision:** pnpm (workspace protocol + catalogs) for dependency management.
**Alternatives:** npm workspaces, Yarn Berry.
**Why:** content-addressable store gives fast, disk-efficient installs across many packages; strict node_modules prevents phantom dependencies, which matters in a monorepo with shared `packages/`; pnpm `catalog:` entries let every app pin the same React/TypeScript version from one place.
**Consequences:** contributors must use pnpm (enforce via `packageManager` field in root `package.json` and `only-allow`). Pin the exact version installed locally via `packageManager: "pnpm@12.3.4"`.

## ADR-002: Monorepo orchestration — Turborepo ✅

**Decision:** Turborepo 2.10.x on top of pnpm workspaces.
**Alternatives:** Nx (more powerful but heavier, opinionated generators we don't need), Bazel (over-engineered for a 3-app monorepo), plain pnpm scripts (no caching/graph awareness).
**Why:** minimal-config task graph + local/remote caching, native pnpm support, small learning curve, Vercel-maintained and Next.js-aligned.
**Consequences:** need a shared remote cache (Vercel Remote Cache or self-hosted) in CI for the caching benefit to pay off — tracked in `DEPLOYMENT.md`.

## ADR-003: Frontend framework — Next.js 16 (App Router) ✅

**Decision:** Next.js 16.x, App Router, Turbopack (default bundler), React 19.2, Server Components by default.
**Alternatives:** Remix (weaker RSC story), Astro (weaker for a highly interactive cart/checkout), plain Vite SPA (loses SSR/SEO for free).
**Why:** first-class SSR/RSC for SEO-critical product/category pages, built-in image optimization, Metadata API for structured SEO, mature App Router (stable since 2024, now the default recommendation for new projects in 2026), Turbopack default build speed.
**Consequences:** two Next.js apps (`storefront`, `admin`) — admin does **not** need SEO/SSR-heavy treatment but shares the same framework for tooling/DX consistency and to reuse `packages/ui`.

## ADR-004: Styling — Tailwind CSS v4 ✅

**Decision:** Tailwind CSS v4.3.x, CSS-first configuration (`@theme` in CSS, no `tailwind.config.js` needed).
**Why:** v4's rewritten engine (5x faster full builds, 100x faster incremental) matters for a large monorepo; CSS-first theme tokens map cleanly onto a design-token driven brand system (see `DESIGN_SYSTEM.md`).
**Consequences:** design tokens (color, type scale, spacing) are defined once in `packages/config` and consumed via `@theme` imports in both `storefront` and `admin`.

## ADR-005: Component layer — shadcn/ui (code-owned) ✅

**Decision:** shadcn/ui as a source generator (components copied into `packages/ui`, not an npm runtime dependency), built on Radix primitives.
**Alternatives:** MUI/Chakra/Ant (too opinionated visually — reads as "generic AI-generated SaaS", exactly what the brief says to avoid), headless Radix/Ariakit from scratch (more work, no gain since shadcn already **is** that).
**Why:** because the components live in our repo, every visual default (radius, shadow, spacing, motion) is fully overridable — essential for a bespoke premium-atelier look rather than a template look. Accessibility (Radix) is inherited for free.
**Consequences:** the design system doc (`DESIGN_SYSTEM.md`) governs how far components are restyled from shadcn defaults — the brief explicitly bans "excessive rounded cards" and "excessive shadows", which are shadcn's _defaults_, so restyling is mandatory, not optional polish.

## ADR-006: Motion — Motion (formerly Framer Motion) v12 ✅

**Decision:** `motion` package, imported via `motion/react`.
**Why:** Framer Motion was renamed/spun out as an independent project ("Motion") in 2025; the old `framer-motion` package still works but is no longer actively developed. Start clean on the maintained package.
**Consequences:** motion use is restrained per brand direction — page-transition and micro-interaction use only, no decorative animation. Respect `prefers-reduced-motion` everywhere (WCAG 2.2 AA requirement).

## ADR-007: i18n — next-intl ✅

**Decision:** next-intl 4.14.x for both `storefront` and `admin`.
**Alternatives:** next-i18next (Pages Router legacy, weaker RSC support), Lingui, Intlayer, rolling our own.
**Why:** built for the App Router from the ground up — Server Component translation with no client-bundle cost, native `[locale]` segment routing, typed message keys.
**Consequences:** locale routing is `/{locale}/...` with `sv-SE` as default/fallback and `en` as the one sibling locale — **`fr-FR` removed entirely** per your 2026-09-08 confirmation (ADR-021: Sweden-only market). Admin (`apps/admin`) is also bilingual `sv-SE`/`en` for staff, per the same confirmation. Product/category/collection **content** (not just UI strings) needs its own translation tables in the database — see `DATABASE.md`; next-intl only covers UI copy, not CMS-style content.

## ADR-008: Backend framework — NestJS 12 ✅

**Decision:** NestJS 12.x (TypeScript, modular DI architecture).
**Alternatives:** Express/Fastify raw (no structure at this scale), Fastify-only (less batteries for RBAC/validation/module boundaries), tRPC-as-backend (rejected — see ADR-011).
**Why:** enforced module boundaries map naturally onto commerce domains (catalog, cart, orders, payments, inventory, identity, admin); first-class Swagger/OpenAPI generation; strong DI makes provider abstractions (`PaymentProvider` ADR-014, `ShippingProvider` ADR-022) and testability straightforward; NestJS 12 is ESM-ready and Node 24 compatible.
**Consequences:** the API is REST/OpenAPI, not GraphQL/tRPC (ADR-011).

## ADR-009: ORM & database driver — Prisma ORM 7 ✅

**Decision:** Prisma ORM 7, using the GA Rust-free (TypeScript/WASM query compiler) engine.
**Alternatives:** Drizzle (lighter, less migration tooling maturity for a team-scale schema like this), raw SQL/Kysely (loses schema-driven type generation and migration DX).
**Why:** Prisma 7's Rust-free client removes the native-binary dependency entirely — smaller Docker images, no more `openssl`/musl binary-target pain in CI or Alpine containers, up to 3.4x faster queries by removing cross-language serialization. Given deployment is still open (ADR-020), removing the native-binary/runtime-compatibility risk is valuable.
**Consequences:** pin `prisma`/`@prisma/client` ≥ 6.16 (Rust-free GA) or 7.x once fully released — treat this as **unverified against a primary source** (npm registry / prisma.io release notes) until checked directly at Phase 1 start; do not pin a version from this document without that check.

## ADR-010: Database engine — PostgreSQL 18 ✅

**Decision:** PostgreSQL 18.x.
**Why:** relational integrity is non-negotiable for money, stock, and orders (the brief is explicit: never trust client-supplied totals/stock). Postgres gives us both `SERIALIZABLE` isolation and row-level locking as available tools for inventory concurrency — **`DATABASE.md` §4 is authoritative on which is actually used** (row-level `FOR UPDATE` locks under `READ COMMITTED`, with `SERIALIZABLE` reserved as a fallback), native JSONB for flexible product attributes, and mature extensions (`pg_trgm` for search, `citext`, etc.).
**Consequences:** none of the "NoSQL for catalog flexibility" temptation — product attribute flexibility is handled via a typed `ProductOption`/`ProductOptionValue` model plus JSONB for genuinely unstructured fields (e.g. care-instruction rich text), not by moving the whole catalog to a document store.

## ADR-011: API contract style — REST + OpenAPI (not GraphQL/tRPC) 🟡

**Decision:** REST endpoints documented via NestJS's built-in Swagger/OpenAPI module; a typed client is generated into a shared package for `storefront`/`admin` consumption.
**Alternatives:** GraphQL (overkill — no multi-client under-fetching problem to solve at this scale, adds a resolver/complexity layer), tRPC (very appealing in an all-TypeScript monorepo, but fits a lightweight function-based backend better than NestJS's controller/DTO-based architecture; also we anticipate 3rd-party consumers — Stripe/Klarna/Swish webhooks, and possibly a future mobile app — where a language-agnostic OpenAPI contract pays off more than tRPC's TS-only type sharing).
**Revisit at scale:** if a future native mobile app or partner integrations need a fully-typed contract without hand-written DTOs, re-evaluate tRPC for _internal_ admin-only calls specifically.

## ADR-012: Cache & queue backing store — Valkey (not Redis) ✅

**Decision:** Valkey (Linux Foundation, BSD-3-Clause, Redis-protocol-compatible fork) for caching, rate-limiting, session lookup, and as the BullMQ backing store.
**Alternatives:** Redis (relicensed from BSD to SSPL/RSALv2 in March 2024; as of May 2025 Redis offers a tri-license including AGPLv3, but AGPLv3's copyleft terms are a poor fit for a commercial hosted product without legal review).
**Why:** Valkey is fully open-source (BSD-3), drop-in protocol-compatible with Redis, backed by the Linux Foundation with AWS/Google/Oracle contributing, and is explicitly the pragmatic default for teams starting fresh in 2026. BullMQ supports it today (via the ioredis-compatible protocol, with a dedicated Valkey Glide adapter available).
**Consequences:** any library assuming "Redis" by name (docs, Docker images) is aliased to Valkey; connection strings/env vars are named `CACHE_URL`/`QUEUE_URL` rather than `REDIS_URL` to keep the door open.

## ADR-013: Background jobs — BullMQ 6.x ✅

**Decision:** BullMQ for delayed jobs (stock-reservation expiry, abandoned-checkout follow-up, webhook retry/backoff, transactional email dispatch, low-stock alert digests).
**Why:** mature, well-documented, works with Valkey, supports delayed/repeatable jobs and dead-letter handling needed for reservation expiry and payment reconciliation.
**Consequences:** workers run as a Nest **standalone application context** inside `apps/api` initially (not a separate `apps/worker`), to keep the monorepo surface minimal; split into a dedicated app only if independent worker scaling is needed post-launch.

## ADR-014: Payments — Stripe as unified PSP for Card, Klarna, and Swish ✅ — **confirmed 2026-09-08**

**Decision:** Implement the `PaymentProvider` abstraction as specified in the brief, but for v1, route **all three** payment methods (card, Klarna, Swish) through a single `StripePaymentProvider`, using Stripe's Payment Intents API with `payment_method_types: ['card', 'klarna', 'swish']`. **You confirmed this explicitly** ("Payments: Stripe → Card + Klarna + Swish") — no longer pending.
**Why this changes the brief's literal reading:** Stripe has first-class, documented support for both Klarna and Swish as payment methods on the _same_ Payment Intents API used for cards — same webhook stream (`payment_intent.succeeded`, etc.), same signature verification, same reconciliation surface, same PCI scope. Building three separate merchant integrations (direct Klarna API + direct Swish API with its PKI merchant certificate process) triples the integration surface, webhook handling, and reconciliation logic for v1 with no functional benefit to the customer.
**Alternatives:** direct Klarna Merchant API + direct Swish API (Swish requires a PKI client-certificate enrollment process with the merchant's bank) — kept as a documented future path, not built now.
**Consequences:** the `PaymentProvider` interface stays provider-agnostic (`KlarnaPaymentProvider`/`SwishPaymentProvider` as _named implementations_ is deferred until there's a business reason — e.g. materially better fees at volume, or a Klarna/Swish feature Stripe doesn't proxy). This satisfies the spirit of "not coupling the order system to one provider" (the abstraction exists, order/payment state machines don't know about Stripe) while keeping v1 to a single PSP integration.
**Note:** Swish does not support recurring/off-session payments (irrelevant for v1, no subscriptions in scope).

## ADR-015: Authentication — hand-rolled session auth in NestJS, not a library ✅

**Decision:** Server-owned, cookie-based session authentication implemented directly in `apps/api` (opaque session tokens, `httpOnly` + `Secure` + `SameSite=Lax` cookies, sessions persisted in Postgres with a Valkey read-through cache, Argon2id password hashing).
**Alternatives:** Lucia (**deprecated March 2025** — the npm package is now explicitly a "learning resource, not a library," so it cannot be a dependency), Auth.js/NextAuth (in security-only maintenance mode, and — more importantly — it's a _Next.js_-shaped solution; putting auth in Next.js would contradict the brief's requirement that NestJS is the single source of truth, since `admin` and any future client would then depend on the storefront's auth), Passport.js strategies inside Nest (viable but adds an abstraction layer for a fairly simple session model; revisit if OAuth/social login is added).
**WhyःNestJS owns auth:** consistent with "NestJS is the source of truth" for every other domain — the storefront and admin are just authenticated HTTP clients of the API, never independent auth authorities.
**Consequences:** MFA-readiness = TOTP secret column on `User`, unused until MFA ships; RBAC via `Role`/`Permission` tables (`DATABASE.md`, `SECURITY.md`).

## ADR-016: Testing stack ✅

**Decision:** Vitest (unit + integration), Playwright 1.62+ (E2E), Nest's testing utilities + Supertest (API-level), Testcontainers for real-Postgres integration tests.
**Why:** Vitest is ESM-native and fast, works identically across `apps/api` (Node) and `packages/*` (shared logic); Playwright is explicitly required by the brief and is the current best-in-class cross-browser E2E tool. Testcontainers over mocking the DB — the brief's own inventory-concurrency requirements can only be honestly tested against a real transactional database.
**Consequences:** see `TESTING.md` for the full pyramid and critical-flow list.

## ADR-017: CI/CD — GitHub Actions + Turborepo remote cache ✅

**Decision:** GitHub Actions pipelines gated on lint → typecheck → unit → integration → build → E2E → security scan, with Turborepo remote caching to keep CI fast as the monorepo grows.
**Why:** repository already lives on GitHub (`origin` → `github.com/alaald-2/ame-de-fil`); no reason to introduce a second CI system.
**Consequences:** see `DEPLOYMENT.md`.

## ADR-018: Containerization — Docker, multi-stage builds ✅

**Decision:** Docker for `apps/api` (and any worker), docker-compose for local dev (Postgres, Valkey, a local SMTP catcher). `storefront`/`admin` are deployed however the hosting decision (ADR-020) dictates — likely without Docker if targeting Vercel.
**Note:** Docker is **not currently installed** in this WSL2 environment (`docker: command not found` — WSL integration for Docker Desktop is not enabled). This blocks local container testing until resolved; see `DEPLOYMENT.md` §1.

## ADR-019: Node.js target — 24 LTS ✅

**Decision:** Node.js 24.x (LTS line) as the engines target for every app/package.
**Why:** matches the locally installed runtime (`v24.20.0`) and is the current LTS in active support as of this discovery.
**Consequences:** `engines.node` pinned in root `package.json`; CI matrix runs against 24.x only (no need to support older Node given this is a new project).

## ADR-020: Deployment target — ❓ open, not decided

Not decided — genuinely needs a product/business decision (budget, ops appetite, existing cloud relationships). Leading candidates documented for reference in `DEPLOYMENT.md` §4, not chosen. **Explicitly deferred by you (2026-09-08)** alongside image storage and email vendor choices — still not blocking the Prisma schema draft or monorepo scaffold.

## ADR-021: Market, locale, and currency scope — Sweden-only ✅ — **confirmed 2026-09-08**

**Decision:** Single market: Sweden. Locales: `sv-SE` (primary) and `en` (secondary, UI-only — not a separate market) across **both** `storefront` and `admin`. Currency: SEK only. VAT: Swedish moms only (25% standard, 12%/6% reduced). Shipping: Sweden only. **`fr-FR` and all French-market/locale assumptions are removed entirely**, including the "French atelier" brand-voice framing in `DESIGN_SYSTEM.md` (replaced with a Scandinavian-only aesthetic direction — the elegant/editorial/warm/artisanal/premium/minimal/sophisticated/timeless adjectives from the original brief are unaffected, only the "French" qualifier is dropped).
**Why this supersedes the original brief:** the founding brief specified `fr-FR` as a secondary locale with French influencing brand voice; you explicitly confirmed on 2026-09-08 that this is now out of scope entirely, in favor of a Sweden-only launch.
**Consequences:**

- No cross-border EU VAT OSS logic — `TaxRate`/`TaxClass` (`DATABASE.md` §2) needs only Swedish rate tiers, not destination-country VAT resolution.
- No multi-currency handling — every amount is SEK; the `currency` column on money fields (`DATABASE.md` §5) remains for correctness/future-proofing but is a constant value in practice for v1.
- Translation tables (`ProductTranslation`/`CategoryTranslation`/`CollectionTranslation`) carry 2 locale rows, not 3.
- `apps/admin` ships with `next-intl` too (previously unaddressed — ADR-007), since admin staff need `sv-SE`/`en`.
- E2E locale coverage (`TESTING.md` §5) is 2 locales, not 3.
- This decision does **not** by itself resolve deployment/storage/email vendor choices (ADR-020) — those remain explicitly deferred by you and are unrelated to market scope.

## ADR-022: Shipping — provider-agnostic `ShippingProvider` abstraction, carrier deferred ✅ — confirmed 2026-09-08

**Decision:** `apps/api`'s order/fulfillment domain depends only on a `ShippingProvider` interface — never on a specific carrier SDK. For v1 this is implemented as a `ManualShippingProvider`: no external carrier API calls, no live rate-shopping, no automated label generation, no tracking webhooks. Admin marks an order ready-to-ship/shipped manually and enters a free-text carrier name/tracking number on the `Shipment` record. `ShippingMethod` (the customer-facing option — e.g. "Standard", "Express") stays carrier-agnostic: name, translated label, price, estimated delivery window — **no carrier-specific fields, no enum of carrier names, anywhere in the schema.**

```ts
// Illustrative shape only — not implemented in this phase.
interface ShippingProvider {
  quoteRates(destination: AddressSnapshot, parcel: ParcelSnapshot): Promise<ShippingRateOption[]>;
  createShipment(order: OrderSnapshot, method: ShippingMethodRef): Promise<ShipmentRef>;
  getTrackingStatus(shipmentId: string): Promise<TrackingStatus>;
  cancelShipment(shipmentId: string): Promise<void>;
}
```

```
ShippingProvider
└── ManualShippingProvider     # v1 — no carrier API; admin enters tracking info manually
    (PostNordShippingProvider / DHLShippingProvider / BringShippingProvider
     — or another carrier's adapter — added later behind the same interface,
     once a carrier is selected; none is chosen now)
```

**Why:** you've explicitly deferred the carrier decision (PostNord/DHL/Bring/other) and asked for the same non-coupling discipline already applied to payments (ADR-014) — the domain model must not hardcode a carrier, and adding a real carrier later must not require redesigning orders, checkout, inventory, or payment architecture.
**Alternatives considered:** provisionally integrating one carrier now (rejected — you explicitly ruled this out, and it's exactly the speculative work the brief warns against); a typed enum on `Shipment` with a single `MANUAL` value pre-reserving future carrier values (rejected in favor of free text for v1 — an enum implies pre-deciding future values; free text is genuinely non-committal and trivially migrated to a typed/foreign-keyed carrier reference once one is chosen).
**Consequences:**

- `ShippingMethod` and `Shipment` (`DATABASE.md` §1) carry zero carrier-specific columns in v1; `Shipment.carrierName`/`Shipment.trackingNumber` are free-text/nullable, not foreign keys into a carrier table.
- `apps/api` gets a `shipping` domain module (`ARCHITECTURE.md` §3) analogous to `payments`, hosting the `ShippingProvider` interface and the `ManualShippingProvider` implementation.
- When a carrier is selected, its adapter (e.g. `PostNordShippingProvider`) implements the same interface and is swapped in via configuration — order/checkout/inventory/payment code is untouched, mirroring how `PaymentProvider` isolates Stripe.
- **Not a Phase 1 blocking decision** — `ManualShippingProvider` is trivial enough to include in the Phase 1 schema/scaffold without waiting on a carrier choice.

## ADR-023: Repository-wide ESM import convention ✅ — confirmed 2026-09-08

**Context:** `node dist/main.js` failed with `ERR_MODULE_NOT_FOUND` because `packages/config`'s source used `.js`-suffixed relative imports (`./env.js`) pointing at files that only exist as `.ts` (the package has no build step). TypeScript's NodeNext resolution silently remaps a `.js` specifier to a sibling `.ts` file **at compile/typecheck time only** — Node's own runtime ESM resolver has no such remapping. The same latent bug existed in `packages/validation` too (not yet triggered, since nothing imported it at runtime yet) — fixed as part of resolving this completely rather than patching only the file that happened to fail.

**Decision — a two-tier convention, chosen by whether the package/app has its own build step:**

1. **Apps/packages that compile to `dist/`** (`apps/api`; later `apps/storefront`/`apps/admin` via Next.js's own build) — relative imports use **`.js` extensions**, the standard TypeScript NodeNext convention. At compile time TS resolves `./foo.js` against the sibling `./foo.ts`; after compilation, the same `.js` specifier correctly points at the real compiled sibling `.js` file sitting next to it in `dist/`. No special flags needed for the package's own files.
2. **Source-only internal workspace packages with no build step** (`packages/config`, `packages/types`, `packages/validation`, `packages/database` — each consumed directly via `"main": "./src/…ts"`, deliberately never compiled) — relative imports use **literal `.ts` extensions**, exactly matching the convention Prisma's own generated client already uses internally. Each such package's `tsconfig.json` sets `allowImportingTsExtensions: true`. This lets Node 24's stable native type-stripping resolve these files directly at runtime, with zero build step, bundler, or ts-node/tsx.

A consuming build (`apps/api`) that type-checks or compiles against a tier-2 dependency's source also needs `allowImportingTsExtensions: true` itself (to parse those `.ts`-suffixed specifiers), and its `tsconfig.build.json` (the config `nest build` actually emits from) additionally needs `rewriteRelativeImportExtensions: true`, which TypeScript requires as a companion to `allowImportingTsExtensions` whenever emitting (not `noEmit`) — `apps/api/tsconfig.json` and `apps/api/tsconfig.build.json` are the reference implementation of this reconciliation.

**Why this is correct, not a workaround:** the two tiers aren't an arbitrary per-file choice — they're the necessary consequence of TypeScript's `.js`→`.ts` remapping being compile-time-only, colliding with two genuinely different consumption models. A package that gets compiled needs `.js` specifiers, because after compilation that's what's really sitting on disk. A package consumed as raw source needs `.ts` specifiers, because that's what's really sitting on disk. Mixing the two within a no-build-step package is exactly what broke.

**Verified (not asserted):** `node --input-type=module -e "import('@ame-de-fil/validation')…"` resolves cleanly and its schemas execute correctly (including the ADR-021 `fr-FR`-rejection behavior) — proving tier 2 works end-to-end, not just for the one file that originally failed. `nest build` → `node dist/main.js` boots all 14 modules, serves `/health` and `/api/docs-json` correctly. `dist/` contains only `apps/api`'s own compiled output — `packages/*` are resolved live via `node_modules` at runtime, never bundled or duplicated into it.

**Consequences:** every future source-only workspace package follows tier 2 from the start — _when its consumers resolve modules via raw Node ESM_ (see the correction below for the other case).

**Correction (Phase 1 storefront/admin checkpoint):** the line above was wrong for `packages/ui`. The real dividing line isn't "has a build step" — it's **how the package is actually resolved at the point of use**:

- **Tier 1 — compiled, consumed via raw Node** (`apps/api`): `.js`-suffixed relative imports (standard NodeNext).
- **Tier 2 — source-only, consumed via raw Node** (`packages/config`, `packages/types`, `packages/validation`, `packages/database`): literal `.ts`-suffixed relative imports + `allowImportingTsExtensions: true`, extending the shared NodeNext base as-is.
- **Tier 3 — source-only, consumed only via a bundler** (`packages/ui`, consumed exclusively by `apps/storefront`/`apps/admin`'s Turbopack/webpack build, never by raw Node): **extensionless** relative imports, with the package's own `tsconfig.json` overriding the shared base to `"moduleResolution": "bundler"`, `"module": "ESNext"`. Discovered because `next/link`'s package exports aren't structured for NodeNext's stricter resolution — a real, reproducible `TS2307` typecheck failure, not a style preference. "Bundler" is the resolution mode Next.js itself is built around; forcing NodeNext onto a Next.js-only-consumed package fights the tool it exists to serve.

The apps themselves (`apps/storefront`, `apps/admin`) also use `moduleResolution: "bundler"`, matching Next.js's own generated tsconfig convention, not `apps/api`'s NodeNext setup — apps/api is the one raw-Node-executed app in this monorepo; everything else that runs through a bundler follows tier 3's convention instead.

## ADR-024: Stripe payment integration — implementation decisions ✅

**Decision:** `StripePaymentProvider implements PaymentProvider` (`apps/api/src/payments/`), card payments only, **automatic capture**. `PaymentsModule` binds `PAYMENT_PROVIDER` via a `useFactory` selecting `StripePaymentProvider` when `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are both set, `PendingPaymentProvider` otherwise — no Stripe test credentials were available in this checkpoint's environment, so this fallback is what boots/tests/builds actually exercised here.

**Klarna/Swish:** not wired in this checkpoint despite ADR-014 routing them through the same Stripe integration eventually — v1 scope here is card only. `StripePaymentProvider`'s `automatic_payment_methods: { enabled: true }` would surface them automatically once Stripe account settings enable those methods, but that's untested and not claimed as working.

**Transaction boundary — kept exactly as designed, not redesigned:** `StripePaymentProvider.createPayment` runs inside `CheckoutService`'s existing single checkout transaction (`PaymentProvider.createPayment(tx, ...)`'s signature already required this). **Accepted risk:** a DB transaction failure after a successful Stripe call can orphan an uncharged `PENDING` PaymentIntent with no local `Order`/`Payment` row. Mitigated for the one realistic repeat-call case (`CheckoutService`'s own `orderNumber`-collision retry) via a Stripe request-level `idempotencyKey` derived from the order ID; not otherwise solved — flagged as future reconciliation-job scope (`PAYMENTS.md` §5), not built now. Rejected alternative: splitting the transaction to create the PaymentIntent outside the lock-holding window — would meaningfully reduce lock time but reintroduces a TOCTOU gap between cart/stock re-validation and order creation that the current single-transaction design specifically avoids; revisit only if load testing (`ROADMAP.md` Phase 7) shows this path actually contends under load.

**Webhook processing is synchronous**, not handed to a BullMQ job as `PAYMENTS.md` §5 originally specified — there is no BullMQ/queue infrastructure anywhere in this repo (a separate, pre-existing, still-open gap, same category as the reservation-expiry scheduler). Disclosed rather than silently deviating.

**Guest order-status polling token** (`OrderStatusToken` — new Prisma model, `packages/database/prisma/migrations/20260909000000_add_order_status_token/`): 256-bit random token (`randomBytes(32)`, base64url), returned once in the checkout response, stored server-side only as a SHA-256 hash — a deliberate divergence from `Session.id`'s plaintext-token-as-primary-key convention (ADR-015), justified because this token travels in a request header set by client-side JS and is handed to the customer in a JSON body, not an httpOnly cookie the browser itself never exposes. Scoped one-per-order, time-limited (`ORDER_STATUS_TOKEN_TTL_HOURS`, default 2h) but reusable within that window. Transported as a custom header (`X-Order-Status-Token`), never a query parameter, to avoid it landing in access logs. This is the one schema addition this checkpoint required — everything else needed for Stripe (Payment/PaymentAttempt/WebhookEvent/IdempotencyKey/StockReservation/InventoryItem/InventoryMovement) already existed from the Phase 1 schema.

**CSP for Stripe.js** added to `apps/storefront/next.config.ts` (there was no prior baseline) — `script-src`/`style-src` include `'unsafe-inline'`, verified necessary live (Next.js's own inline hydration/RSC bootstrap scripts are unnonced; omitting this broke the app's own JS, not just a theoretical gap) rather than assumed. A nonce-based CSP would avoid this but requires per-request middleware plumbing out of scope for this checkpoint.

**Verified (not asserted) in this environment:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (252 API tests + 9 validation tests, all mocking Stripe — no real credentials touched), and `pnpm build` (API + storefront + admin) all pass with no `STRIPE_*` credentials configured, confirming the `PendingPaymentProvider` fallback path is real, not aspirational. No live Stripe test-mode verification was performed — no Stripe test credentials were available in this environment; also no live Postgres/Docker was available, so the API could not be run against a real database at all (checked directly: `apps/api` boots cleanly and correctly reports `/health` as degraded with `database: down`, consistent with `DEPLOYMENT.md` §1's already-disclosed Docker/WSL gap). Full checkout-with-real-payment E2E verification remains pending external verification, not claimed here.
