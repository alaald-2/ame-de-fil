# Âme de Fil

Premium handmade crochet e-commerce platform. Scandinavian-atelier brand — elegant, editorial, warm, artisanal, timeless; production-grade platform, not a template.

> **Status: Phase 1 (Foundations) in progress.** Discovery/architecture (Phase 0) is complete and approved. The monorepo tooling foundation (pnpm/Turborepo, shared TS/ESLint config, `packages/types`, `packages/validation`) is scaffolded and verified working. Database schema, API, and everything else in `docs/ROADMAP.md` Phase 1 is still to come.

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
| [`docs/DECISIONS.md`](docs/DECISIONS.md)         | Every major technology decision, with alternatives and rationale        |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)             | Implementation phases                                                   |

## Planned stack

| Layer              | Choice                                           | Why (see `docs/DECISIONS.md`)                                                 |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Monorepo           | pnpm + Turborepo                                 | Fast, disk-efficient, minimal-config task caching                             |
| Storefront / Admin | Next.js 16 (App Router), React 19, TypeScript    | SSR/RSC for SEO, `next-intl` for `sv-SE`/`en` (Sweden-only market, confirmed) |
| Styling / UI       | Tailwind CSS v4, shadcn/ui (code-owned), Motion  | Fully overridable — no generic-template look                                  |
| API                | NestJS 12                                        | Single source of truth for prices, stock, orders, payments                    |
| Database           | PostgreSQL 18 + Prisma ORM 7 (Rust-free)         | Transactional integrity for money/stock; smaller, native-binary-free deploys  |
| Cache / Queue      | Valkey + BullMQ                                  | BSD-licensed Redis-compatible fork; reservation expiry, webhook retries       |
| Payments           | Stripe (card, Klarna, Swish via Payment Intents) | Unified PSP behind a provider-agnostic interface — ADR-014, confirmed         |
| Testing            | Vitest, Playwright, Testcontainers               | Unit → integration (real Postgres) → API → E2E                                |
| CI/CD              | GitHub Actions + Turborepo remote cache          | Lint → typecheck → test → build → E2E → security scan → deploy                |

## Repository structure (see `docs/ARCHITECTURE.md` §2)

```
apps/          (not yet created — storefront, api, admin come later in Phase 1)
packages/
  config/         tsconfig base — done
  eslint-config/  shared flat ESLint config — done
  types/          shared TS types — scaffolded, empty until domains exist
  validation/     Zod schemas (Locale, Currency, Money so far) — done
  ui/             not yet created
  email/          not yet created
  database/       not yet created (Prisma schema is the next Phase 1 step)
docs/
```

## Getting started

```bash
pnpm install
pnpm run typecheck   # tsc --noEmit across all packages
pnpm run lint        # eslint across all packages
pnpm run test        # vitest across all packages
pnpm run format      # prettier --write .
```

Requires Node.js 24.x and pnpm (pinned via `packageManager` in `package.json`). No database, no apps, and no `docker-compose` stack yet — those are still ahead in Phase 1 (`docs/ROADMAP.md`).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

See [`SECURITY.md`](SECURITY.md) for the vulnerability-disclosure policy, or [`docs/SECURITY.md`](docs/SECURITY.md) for the security architecture.
