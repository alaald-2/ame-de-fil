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

**Webhook processing is synchronous**, not handed to a BullMQ job as `PAYMENTS.md` §5 originally specified — there is no BullMQ/queue infrastructure anywhere in this repo. Disclosed rather than silently deviating. (The reservation-expiry scheduler was in the same category as of this ADR entry's original writing — resolved separately, see ADR-025.)

**Guest order-status polling token** (`OrderStatusToken` — new Prisma model, `packages/database/prisma/migrations/20260909000000_add_order_status_token/`): 256-bit random token (`randomBytes(32)`, base64url), returned once in the checkout response, stored server-side only as a SHA-256 hash — a deliberate divergence from `Session.id`'s plaintext-token-as-primary-key convention (ADR-015), justified because this token travels in a request header set by client-side JS and is handed to the customer in a JSON body, not an httpOnly cookie the browser itself never exposes. Scoped one-per-order, time-limited (`ORDER_STATUS_TOKEN_TTL_HOURS`, default 2h) but reusable within that window. Transported as a custom header (`X-Order-Status-Token`), never a query parameter, to avoid it landing in access logs. This is the one schema addition this checkpoint required — everything else needed for Stripe (Payment/PaymentAttempt/WebhookEvent/IdempotencyKey/StockReservation/InventoryItem/InventoryMovement) already existed from the Phase 1 schema.

**CSP for Stripe.js** added to `apps/storefront/next.config.ts` (there was no prior baseline) — `script-src`/`style-src` include `'unsafe-inline'`, verified necessary live (Next.js's own inline hydration/RSC bootstrap scripts are unnonced; omitting this broke the app's own JS, not just a theoretical gap) rather than assumed. A nonce-based CSP would avoid this but requires per-request middleware plumbing out of scope for this checkpoint.

**Verified (not asserted) in this environment:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (252 API tests + 9 validation tests, all mocking Stripe — no real credentials touched), and `pnpm build` (API + storefront + admin) all pass with no `STRIPE_*` credentials configured, confirming the `PendingPaymentProvider` fallback path is real, not aspirational. No live Stripe test-mode verification was performed — no Stripe test credentials were available in this environment; also no live Postgres/Docker was available, so the API could not be run against a real database at all (checked directly: `apps/api` boots cleanly and correctly reports `/health` as degraded with `database: down`, consistent with `DEPLOYMENT.md` §1's already-disclosed Docker/WSL gap). Full checkout-with-real-payment E2E verification remains pending external verification, not claimed here.

## ADR-025: Reservation-expiry scheduling — `@nestjs/schedule` in-process interval, not BullMQ ✅

**Context:** `ReservationExpiryService.releaseExpiredReservations()` (the idempotent release logic itself) existed from the Stripe checkpoint (ADR-024) with no automatic trigger — only a manual `POST /admin/checkout/expire-reservations` endpoint. `ARCHITECTURE.md` §5 and `DATABASE.md` §4 originally described the intended trigger as a BullMQ delayed job, matching ADR-013's broader plan for background processing.

**Decision:** `ReservationExpiryScheduler` (`apps/api/src/checkout/reservation-expiry.scheduler.ts`) — a periodic sweep using `@nestjs/schedule`'s `SchedulerRegistry`, registering a plain `setInterval` at boot (`onModuleInit`) rather than a static `@Interval()` decorator, specifically so the interval itself stays a configurable env var (`RESERVATION_EXPIRY_SWEEP_INTERVAL_MS`, default 60s) — a decorator argument is a compile-time constant and can't read `ConfigService`. Every tick calls the existing, unmodified `ReservationExpiryService.releaseExpiredReservations()`, which queries for *all* currently-expired reservations (not one job per reservation's `expiresAt`, as the original per-item BullMQ-job sketch implied).

**Why not BullMQ, as ADR-013 originally specified for this job:** BullMQ requires Valkey as its backing store, and — like PostgreSQL in this dev environment — no Valkey instance is provisioned or reachable here either. Building the BullMQ integration now would mean shipping code that has never actually run, for a job whose correctness requirement (release stock that's provably expired, idempotently, on a bounded delay) doesn't need BullMQ's retry/backoff/dead-letter guarantees — a periodic idempotent sweep is a complete, correct solution on its own. `@nestjs/schedule` has no such external dependency and its peer range (`^11.0.0 || ^12.0.0`) covers this project's Nest 12, verified against npm before adding (the same check that previously ruled out `@nestjs/throttler` for this Nest version — `SECURITY.md` §4).

**Consequences:**

- `ARCHITECTURE.md` §5, `DATABASE.md` §4, and `PAYMENTS.md` §7 are corrected to describe this mechanism, not the originally-sketched BullMQ job — reservation expiry is now the one background job in this project that's actually implemented and running, distinct from the still-unbuilt BullMQ jobs (webhook-retry backoff, low-stock digests, transactional email) ADR-013 covers.
- Runs correctly under horizontal scaling with no coordination needed: each API instance registers its own independent interval, but `ReservationExpiryService`'s existing guarded `PENDING -> EXPIRED` conditional updates mean only one instance's sweep ever actually claims and releases a given reservation — redundant sweeps across instances cost an extra query, never a double-release.
- **Not equivalent to BullMQ on every dimension** — an in-process `setInterval` has no persistence across a process restart (a reservation that expired in the seconds before a restart just waits for the next tick after boot, which is still bounded by the sweep interval, not lost or silently skipped) and no delivery/retry guarantees beyond "try again next tick," which the idempotent design tolerates but a true BullMQ job's dead-letter queue would additionally make observable. Acceptable for v1; revisit if a real BullMQ/Valkey deployment exists and operational visibility into missed sweeps becomes a real requirement.
- The manual `POST /admin/checkout/expire-reservations` endpoint (`AdminCheckoutController`) is retained as the ops-triggered complement for an immediate on-demand run, not superseded by the scheduler.
- **Verified (not asserted):** `pnpm lint`/`typecheck`/`test` (257 API tests, 5 new — covering interval registration with the configured value, tick-driven calls to `releaseExpiredReservations` under fake timers, error-swallowing on a failed tick without killing the interval, and interval cleanup on module destroy) and `pnpm build` all pass. `apps/api` boots cleanly with `ScheduleModule.forRoot()` and the scheduler registered — checked directly via a live boot in this environment (still against no reachable database, so the sweep's actual DB behavior at the configured 60s interval was not observed end-to-end; the release logic itself was already verified in `reservation-expiry.service.spec.ts` from the earlier checkpoint).

## ADR-026: Reservation-expiry vs. payment-success race — Order state on late success ✅

**Context:** `ReservationExpiryScheduler`/`ReservationExpiryService` (ADR-025) and `PaymentsWebhookService`'s `payment_intent.succeeded` handler (ADR-024) both act on the same `Order`/`StockReservation` rows independently and asynchronously — the sweep on a fixed interval, the webhook whenever Stripe's customer-facing payment confirmation actually completes. This checkpoint had, for the first time, a reachable local Postgres (`docker-compose.yml`) and real Stripe test-mode credentials, and used them to run the full checkout → PaymentIntent → webhook → state-transition flow live — surfacing and fixing two other real defects invisible under mocked tests first (a Prisma create-payload/schema field mismatch in `checkout.service.ts`, and the P2002-duplicate-key detection helper in `prisma-errors.ts` being written against the classic query-engine's error shape rather than the `@prisma/adapter-pg` shape this project actually runs — ADR-009), before this race was even reachable to test.

With those fixed, live testing reproduced a real, reachable race: a reservation's TTL can expire while its `PaymentIntent` is still `PENDING` (a slow customer, a 3DS delay), and the sweep can commit `Order.status → CANCELED` *before* the later `payment_intent.succeeded` webhook arrives for that same order. `PaymentsWebhookService.confirmOrderOrFlagStockLost`'s stock-lost branch (`DATABASE.md` §4 step 3) originally guarded only on `status = PENDING_PAYMENT`, so whichever side of the race the sweep won, the intended `PAYMENT_SUCCEEDED_STOCK_LOST` write matched zero rows and silently did nothing — leaving `Payment.status = PAID` under `Order.status = CANCELED` forever. That is exactly the "silently keep the money for nothing" outcome `PAYMENTS.md` §4's stock-lost design exists to prevent, just reached via a path the original guard didn't cover.

**Decision:** broaden that guard to `status IN (PENDING_PAYMENT, CANCELED)`, and clear `canceledAt` on the transition (the order didn't actually end up canceled). No schema change, no migration — a guard-condition fix. This is safe without a cancellation-reason column because, in the current implementation, `CANCELED` has exactly two sources: this same sweep, and `handleFailedOrCanceled` for a *definitive* Stripe failure/cancellation on the *same* PaymentIntent. The second source can never reach this branch for a later `succeeded` event on that PaymentIntent — `handleSucceeded`'s own, earlier `Payment.status = PENDING` guard already rejects it, since a failed/canceled webhook already moved `Payment.status` away from `PENDING`. So an order found `CANCELED` in this branch can only be this exact race, never a different cancellation being incorrectly reopened by an unrelated event. Full narrative in `PAYMENTS.md` §4a.

**Consequences:**

- `PAYMENTS.md` §3's order state-machine diagram gains two edges (`PENDING_PAYMENT → PAYMENT_SUCCEEDED_STOCK_LOST`, `CANCELED → PAYMENT_SUCCEEDED_STOCK_LOST`) that were previously undiagrammed even though `PAYMENT_SUCCEEDED_STOCK_LOST` itself has existed as an `OrderStatus` value since ADR-024.
- **Correction to ADR-024's "no live verification was performed" note:** that was an accurate record of that checkpoint's environment at the time. This checkpoint's live verification covers the successful/failed/canceled payment paths, server-authoritative amounts, webhook signature verification and rejection, replay idempotency (including under genuine concurrent duplicate delivery, not just sequential replay), guest order-status token authorization, the reservation-expiry scheduler running live, and this race — all against a real database and real Stripe test API.
- Regression test added directly against the guard in `payments-webhook.service.spec.ts`.
- **Verified (not asserted):** reproduced live — reservation force-expired, the running scheduler's own tick canceled the order, the PaymentIntent was then confirmed via the real Stripe API, the real signature-verified webhook was processed, and the order landed on `PAYMENT_SUCCEEDED_STOCK_LOST` with `Payment.status = PAID`, `canceledAt` cleared, the reservation left `EXPIRED` (not consumed), and zero inventory movement. `pnpm --filter @ame-de-fil/api test`, workspace-wide `pnpm lint`/`pnpm typecheck`/`pnpm test`, and `pnpm build` all pass.

## ADR-027: Testcontainers integration test suite — closing Phase 3's last gap ✅

**Context:** `ROADMAP.md`'s Phase 3 section listed "No Testcontainers integration tests for the webhook-vs-reservation-expiry race" as an explicit, standing blocker — `TESTING.md` §3 had always specified this layer (Vitest + Testcontainers, real Postgres, no mocked Prisma client) but it was never built; ADR-026's fix was verified only manually (live curl/Stripe CLI/DB inspection), leaving no permanent, CI-runnable regression coverage for either that race or the `lineTaxMinor` schema-mismatch defect (`ADR-026` context), both of which were only ever reachable against a real database.

**Decision:** `@testcontainers/postgresql` (`^12.1.0`) added as an `apps/api` devDependency — the dedicated Postgres module rather than the generic `testcontainers` `GenericContainer`, for its typed `getConnectionUri()`/lifecycle API. Two new files:

- `apps/api/src/test/testcontainers-postgres.ts` — starts a real `postgres:18` container (matching `docker-compose.yml`/`ARCHITECTURE.md`'s documented target), runs the project's actual committed migrations against it via `pnpm --filter @ame-de-fil/database exec prisma migrate deploy` (never `db push`, per `CONTRIBUTING.md`), and constructs a real `PrismaService` against it — the same class and wiring `apps/api`'s own DI container uses in production, not a parallel test-only client.
- `apps/api/src/test/fixtures.ts` — a `ShopFixture` (TaxClass/ShippingMethod, seeded once per test file since `TaxClass.code` must be the literal `SHIPPING_TAX_CLASS_CODE` a real business rule depends on, and is `@unique`) and a `VariantFixture` (Product/ProductVariant/InventoryItem, seeded fresh per test so one test's `onHand`/`reserved` changes never leak into another's assertions).

Two spec files, run via a **separate** `pnpm --filter @ame-de-fil/api test:integration` (`vitest.integration.config.ts`, `include: ["**/*.integration.spec.ts"]`, 120s timeouts) rather than folded into the existing `test` script — `vitest.config.ts`'s default run now explicitly excludes this pattern. This mirrors `DEPLOYMENT.md` §2's CI pipeline, where "Unit tests" and "Integration tests — Vitest + Testcontainers" are already distinct, sequential stages, not one script — and keeps the fast, Docker-independent unit suite's feedback loop untouched:

- `checkout-flow.integration.spec.ts`: runs the real, unmocked `CheckoutService.initiate()` against real Postgres with `ManualShippingProvider`/`PendingPaymentProvider` (no Stripe network calls) — this is the standing regression test for the `lineTaxMinor` defect (ADR-026's context): it spreads the real pricing/snapshot code path into a real `tx.orderItem.create()`, which is exactly where that bug threw `PrismaClientValidationError` and where `checkout.service.spec.ts`'s mocked `orderItem.create` could never have caught it.
- `reservation-expiry-race.integration.spec.ts`: `ReservationExpiryService`/`PaymentsWebhookService` constructed directly (no HTTP layer — `TESTING.md` §3/§4's explicit distinction between "integration" and "API" tests) against the real database. Covers idempotent reservation release (repeated calls, one release), webhook replay idempotency (same event ID twice, real P2002 shape), the sweep-then-late-webhook race sequentially (ADR-026's exact scenario), and — new coverage beyond what manual testing could reach — the same race fired **genuinely concurrently** via `Promise.all`, letting Postgres itself decide which transaction commits first rather than a script dictating an order.

**Consequences:**

- `ROADMAP.md` Phase 3 marked ✅ complete — all four originally-listed blockers resolved (three by live verification, ADR-026's fix, and this ADR).
- No schema change, no CI workflow added (`.github/workflows` doesn't exist yet in this repo — a separate, pre-existing gap, out of scope here); this ADR only adds the test suite and its dedicated script.
- Some `testcontainers` transitive dependencies (`ssh2`, `cpu-features`, `protobufjs` — its optional remote-Docker-host SSH-tunnel support) had their install scripts blocked by pnpm's supply-chain policy; left blocked rather than approved, since a local-Docker-socket smoke test confirmed the library works correctly without them for this project's use case.
- **Verified (not asserted):** `pnpm --filter @ame-de-fil/api test:integration` — 2 files, 5 tests, all passing against a real, freshly-provisioned Postgres container, including the genuinely-concurrent race. `pnpm --filter @ame-de-fil/api test` still passes unchanged (42 files, 264 tests — confirming the exclude pattern works and the fast suite is unaffected), as do `lint`/`typecheck`.

## ADR-028: Klarna enabled, Swish deferred (Stripe Dashboard blocker), `Payment.method` populated ✅

**Context:** ADR-014 confirmed routing Card, Klarna, and Swish through one `StripePaymentProvider` using an explicit `payment_method_types: ['card', 'klarna', 'swish']`. The actual Phase 3 implementation instead used `automatic_payment_methods: { enabled: true }`, and ADR-024 left Klarna/Swish "untested and not claimed as working." With Phase 3's live Postgres/Stripe environment now in place, this checkpoint verified both, live, against the real connected Stripe test account.

**Findings, verified live (not assumed):**
- `payment_method_types: ["card", "klarna"]` → accepted by Stripe's API.
- `payment_method_types: ["card", "klarna", "swish"]` → rejected: `"The payment method type 'swish' is invalid... ensure the provided type is activated in your dashboard"`. This is a Stripe Dashboard/account action (likely needing Stripe's own approval, since Swish is a bank-linked Swedish method) — not a code gap, and not something fixable from this codebase.
- A full real checkout → Klarna's actual sandbox redirect/confirmation flow (Playwright-driven, `pm-redirects.stripe.com` → Klarna's `playground.klarna.com` test environment → real "Betala med Klarna" confirmation) → real `payment_intent.succeeded`/`charge.succeeded` webhooks, all processed correctly: `Order.status = CONFIRMED`, `Payment.status = PAID`, `Payment.method = "klarna"`, correct single inventory decrement and `SALE` movement, exactly one `PaymentAttempt`.
- The storefront's existing `<PaymentElement />` (`payment-step.tsx`) needed **no code change** — it's fully provider-agnostic and rendered both "Card" and "Klarna" as selectable options the moment the backend's PaymentIntent offered them (confirmed visually in a real browser against the running storefront dev server).
- Stripe.js itself warns in the browser console that Klarna, like Swish, "will be displayed in test mode, but hidden in live mode" until activated on the account's Dashboard — so a production launch will need that same one-time activation step for Klarna too, even though it already works for testing today.
- A card checkout was re-run afterward as a regression check: unaffected by the switch away from `automatic_payment_methods`, and now also correctly records `Payment.method = "card"`.

**Decision:**
1. `stripe-payment.provider.ts` now uses an explicit `ENABLED_PAYMENT_METHOD_TYPES = ["card", "klarna"] as const`, passed as `payment_method_types` — matching ADR-014's original decision, and as a side effect no longer silently offering Link/Amazon Pay (`automatic_payment_methods`'s behavior), neither ever confirmed in scope. Swish is deferred: adding it back is a one-line change to this array once Dashboard-activated.
2. `Payment.method` (an existing, previously-unpopulated schema column) is now written from the `charge.succeeded` webhook event's `payment_method_details.type` — a new `"paymentMethodRecorded"` `VerifiedWebhookOutcome`, handled in its own branch in `PaymentsWebhookService.handle()` so it can never be mistaken for a failure/cancellation outcome. Purely informational, no state-machine impact (`PAYMENTS.md` §4).

**Consequences:**
- `PAYMENTS.md` §1/§4 updated with the explicit payment-method-types rationale, the live Klarna/Swish findings, and the `charge.succeeded`/`Payment.method` mechanism.
- `ROADMAP.md` Phase 4 records Klarna as live/verified and Swish as blocked on a real, external, one-line-away Dashboard action — not "not built."
- No schema migration (the `method` column already existed), no frontend changes.
- **Verified (not asserted):** `pnpm --filter @ame-de-fil/api test` (269 tests, 5 new), `lint`, `typecheck` all pass. Live: real Klarna checkout end-to-end (above) and a real card-checkout regression check, both against the real local Postgres and Stripe test API.
