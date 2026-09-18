# Âme de Fil

Premium handmade crochet e-commerce platform. Scandinavian-atelier brand — elegant, editorial, warm, artisanal, timeless; production-grade platform, not a template.

> **Status:** well past initial foundations. `apps/api` (NestJS), `apps/storefront` (Next.js, customer-facing), and `apps/admin` (Next.js, staff-facing) all exist and run against a real Postgres database. Core commerce (catalog, cart, checkout, orders, payments via Stripe, auth, inventory, admin operations) is built and tested; shipping now includes two real carrier integrations (Shipmondo, live-verified; PostNord, built and unit-tested, pending sandbox credentials) alongside the original manual/admin-entered fallback. See `docs/DECISIONS.md` for the full, dated history of every major decision and `docs/ROADMAP.md` for phase-level scope — both are living documents, not a fixed plan.

## Documentation

| Doc                                              | Covers                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)   | Business/product requirements, scope, assumed non-goals                 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)   | System design, monorepo structure, request flow                         |
| [`docs/DATABASE.md`](docs/DATABASE.md)           | Data model, entities, inventory concurrency design                      |
| [`docs/PAYMENTS.md`](docs/PAYMENTS.md)           | Provider abstraction, order/payment state machines, webhook handling    |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Brand direction, typography, color, component philosophy, accessibility |
| [`docs/SEO.md`](docs/SEO.md)                     | Rendering strategy, i18n SEO, structured data, performance              |
| [`docs/SECURITY.md`](docs/SECURITY.md)           | Auth, RBAC, threat model, GDPR                                          |
| [`docs/TESTING.md`](docs/TESTING.md)             | Test pyramid, critical E2E flows                                        |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)       | Environments, CI/CD pipeline, containerization                          |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)         | Every major technology/implementation decision, with rationale, dated   |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)             | Implementation phases and their current status                          |

## Stack

| Layer              | Choice                                                                                                                               | Why (see `docs/DECISIONS.md`)                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Monorepo           | pnpm + Turborepo                                                                                                                     | Fast, disk-efficient, minimal-config task caching                             |
| Storefront / Admin | Next.js 16 (App Router), React 19, TypeScript                                                                                        | SSR/RSC for SEO, `next-intl` for `sv-SE`/`en` (Sweden-only market, confirmed) |
| Styling / UI       | Tailwind CSS v4, shadcn/ui (code-owned), Motion                                                                                      | Fully overridable — no generic-template look                                  |
| API                | NestJS 12                                                                                                                            | Single source of truth for prices, stock, orders, payments                    |
| Database           | PostgreSQL 18 + Prisma ORM 7 (Rust-free)                                                                                             | Transactional integrity for money/stock; smaller, native-binary-free deploys  |
| Payments           | Stripe (card, Klarna; Swish code-ready, pending Stripe activation)                                                                   | Unified PSP behind a provider-agnostic interface — ADR-014, live-verified     |
| Shipping           | `ShippingProvider` abstraction — Manual (fallback), Shipmondo (DHL Freight, live), PostNord (Mypack Collect, built, pending sandbox) | Carrier-agnostic by design — ADR-022/037/038/039/040                          |
| Testing            | Vitest, Playwright, Testcontainers                                                                                                   | Unit → integration (real Postgres) → API → E2E                                |
| CI/CD              | GitHub Actions + Turborepo remote cache                                                                                              | Lint → typecheck → test → build → E2E → security scan → deploy                |

## Repository structure (see `docs/ARCHITECTURE.md` §2)

```
apps/
  api/          NestJS API — identity, catalog, cart, checkout, orders, payments,
                shipping, inventory, discounts, reviews, customers, admin, notifications,
                audit, dashboard, tasks, marketing, addresses
  storefront/   Next.js customer-facing site (sv-SE/en)
  admin/        Next.js staff-facing dashboard
packages/
  config/         shared tsconfig base
  eslint-config/  shared flat ESLint config
  types/          shared TS types (generated OpenAPI client types + hand-written domain types)
  validation/     shared Zod schemas (Locale, Currency, Money, etc.)
  database/       Prisma schema, migrations, seed script
  email/          bilingual React Email templates
  ui/             shared React component library (code-owned, not a generic UI kit)
docs/
```

## Getting started

```bash
pnpm install
docker compose up -d          # Postgres + Mailpit (local SMTP catcher)
pnpm --filter @ame-de-fil/database run seed

pnpm run dev                  # turbo run dev — all apps in parallel
# or individually:
pnpm --filter @ame-de-fil/api run start:dev       # http://localhost:3000
pnpm --filter @ame-de-fil/storefront run dev       # http://localhost:3001 (PORT=3001)
pnpm --filter @ame-de-fil/admin run dev            # http://localhost:3002

pnpm run typecheck   # tsc --noEmit across all packages
pnpm run lint        # eslint across all packages
pnpm run test        # vitest across all packages
pnpm run format      # prettier --write .
```

Requires Node.js 24.x and pnpm (pinned via `packageManager` in `package.json`), plus Docker for the local Postgres/Mailpit stack (`docker-compose.yml`). Copy each app's `.env.example` to `.env` before running — every third-party integration (Stripe, Shipmondo, PostNord, Google OAuth, Cloudinary, SMTP) is optional at the config level and falls back to a disclosed no-op provider when unset, so the app boots and core commerce works with zero external credentials configured.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

See [`SECURITY.md`](SECURITY.md) for the vulnerability-disclosure policy, or [`docs/SECURITY.md`](docs/SECURITY.md) for the security architecture.
