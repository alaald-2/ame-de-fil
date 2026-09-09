# Architecture — Âme de Fil

See `DECISIONS.md` for the reasoning and alternatives behind every choice below.

## 1. System overview

```mermaid
flowchart TB
    subgraph Client
        Browser[Customer / Admin browser]
    end

    subgraph Edge
        SF["apps/storefront (Next.js 16, sv-SE / en)"]
        AD["apps/admin (Next.js 16, staff-only, sv-SE / en)"]
    end

    subgraph Core
        API["apps/api (NestJS 12) — single source of truth"]
        Worker["BullMQ workers (standalone Nest context, inside apps/api)"]
    end

    subgraph Data
        PG[(PostgreSQL 18)]
        Valkey[(Valkey — cache / rate-limit / queue)]
        Blob[(Object storage — product images, TBD provider)]
    end

    subgraph External
        Stripe[Stripe — Card + Klarna + Swish]
        Email[Transactional email provider — TBD]
        Carrier[Shipping carrier — TBD, PostNord/DHL/Bring/other]
    end

    Browser --> SF
    Browser --> AD
    SF -- REST/OpenAPI, HTTPS --> API
    AD -- REST/OpenAPI, HTTPS --> API
    API --> PG
    API --> Valkey
    API --> Blob
    API -- Payment Intents, webhooks --> Stripe
    Worker --> PG
    Worker --> Valkey
    Worker -- transactional sends --> Email
    Stripe -- signed webhooks --> API
    API -.->|"ShippingProvider — v1 is manual, no v1 integration"| Carrier
```

**Key rule (from the brief, non-negotiable):** `storefront` and `admin` never talk to PostgreSQL or Stripe directly. They are authenticated HTTP clients of `apps/api`. All pricing, stock, discount, and payment-status logic is computed and verified server-side.

## 2. Monorepo structure

The brief's proposed structure is sound; it is adopted with one addition (`packages/email`) and `packages/database` clarified as **Prisma-only, consumed exclusively by `apps/api`** (never imported by `storefront`/`admin` — enforced by not adding it as a dependency of those apps, not just by convention).

```
ame-de-fil/
├── apps/
│   ├── storefront/        # Next.js 16 — customer-facing, sv-SE/en, SSR+RSC, SEO-critical
│   ├── api/                # NestJS 12 — REST/OpenAPI, owns all writes, hosts BullMQ workers
│   └── admin/              # Next.js 16 — staff-only, sv-SE/en, no public SEO surface, same design tokens
├── packages/
│   ├── ui/                  # shadcn-derived component source, design tokens, Tailwind preset
│   ├── types/                # Shared TS types + generated OpenAPI client types
│   ├── validation/           # Zod schemas — single source of truth for form + DTO validation
│   ├── config/                # Shared tsconfig, eslint base, Tailwind theme tokens, env schema
│   ├── eslint-config/          # Flat ESLint config, shared across all apps/packages
│   ├── email/                  # React Email transactional templates (used only by apps/api)
│   └── database/                # Prisma schema, migrations, seed scripts — apps/api only
├── docs/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Why `packages/validation` matters here specifically:** the brief is explicit that prices/stock/discounts must never be trusted from the browser. Sharing Zod schemas means the _shape_ of a valid `AddToCartRequest` etc. is defined once, but the schema only ever checks shape/format — business rules (is this variant actually in stock, is this discount actually active) are re-derived server-side from the database on every request, never taken from client input. Shared validation is a DX/consistency tool, not a trust boundary.

## 3. API contract

REST, versioned from day one (`/api/v1/...`), documented via NestJS's Swagger module. A typed client is generated at build time into `packages/types` (or a dedicated `packages/api-client`) so `storefront`/`admin` get compile-time safety without hand-maintained fetch wrappers.

Domain modules in `apps/api` (Nest modules, one per bounded context): `identity` (users/roles/sessions), `catalog` (products/variants/categories/collections), `inventory`, `cart`, `checkout`, `orders`, `payments`, `shipping` (carrier-agnostic `ShippingProvider` abstraction, `ManualShippingProvider` for v1 — `DECISIONS.md` ADR-022), `discounts`, `reviews`, `customers`, `admin` (cross-cutting admin operations), `notifications`, `audit`.

## 4. Rendering & data-flow strategy (storefront)

- **Server Components by default**; client components only where interactivity requires it (cart drawer, quantity steppers, filter UI, checkout form).
- Product/category/collection pages are rendered server-side against `apps/api`, with Next.js's caching (`revalidate`/tag-based invalidation) fronting read-heavy catalog data — **the API remains authoritative**; caching is a performance layer the API can invalidate (e.g., on stock/price change), not a second source of truth.
- Cart and checkout are always fetched fresh (no stale cache) given they involve stock and price.

## 5. Background processing

Reservation expiry, abandoned-checkout follow-up, webhook-retry backoff, low-stock digest emails, and transactional email dispatch run as BullMQ jobs against Valkey. Workers start as a Nest **standalone application context** inside `apps/api` (`NestFactory.createApplicationContext`) rather than a separate deployable app — this keeps the three-app surface from the brief intact. Revisit (split into `apps/worker`) only if worker load needs to scale independently of the HTTP API.

## 6. Open architectural questions

Market/locale/currency scope is now confirmed (Sweden-only, `sv-SE`+`en`, SEK-only — `DECISIONS.md` ADR-021). Still open, by your explicit choice: deployment target, image storage provider, email provider (`DECISIONS.md` ADR-020), and shipping carrier — the `ShippingProvider` abstraction (ADR-022) means none of these block Phase 1.
