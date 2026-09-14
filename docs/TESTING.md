# Testing Strategy — Âme de Fil

This document defines the target strategy; §§1–6 below describe the intended shape of each layer, not a claim that all of them are equally built out.

**Current status** (`pnpm --filter @ame-de-fil/api test` / `test:integration`, most recently confirmed at `DECISIONS.md` ADR-036): 791 unit tests (Vitest, mocked Prisma/services — §2) and 126 integration tests (Vitest + Testcontainers, real Postgres — §3) pass. The §4 "API tests" layer — a real Nest application booted in-memory, Supertest exercising the actual HTTP surface (auth/authorization status codes, DTO validation) — exists for 12 of 14 controllers today, including `AuthController`'s password, registration/verification/reset, OTP-login, and Google sign-in endpoints against the real `SessionAuthGuard`/`PermissionsGuard`/`EmailVerifiedGuard`/`CsrfGuard` chain (`auth.controller.spec.ts`, DECISIONS.md ADR-032/ADR-033/ADR-035/ADR-036); `CategoriesController`/`CollectionsController` have no controller-level test at all yet, only their service layers (`categories.service.spec.ts`/`collections.service.spec.ts`). RBAC's real `Role`/`Permission`/`UserRole`/`RolePermission` join — §3's own bullet below, previously a named target with no login path to reach it — is now exercised for real by `auth.integration.spec.ts`, alongside `registration.integration.spec.ts`/`password-reset.integration.spec.ts`/`login-otp.integration.spec.ts`'s real concurrency/expiry/revocation/attempt-limiting coverage (ADR-035/ADR-036). No E2E (Playwright) suite exists yet (§5).

## 1. Pyramid

```
        ┌───────────────┐
        │   E2E (few)    │  Playwright — critical user journeys, cross-browser
        ├───────────────┤
        │ API tests       │  Supertest + Nest testing module — endpoint contracts
        ├───────────────┤
        │ Integration      │  Vitest + Testcontainers (real Postgres) — DB-touching logic
        ├───────────────┤
        │ Unit (many)       │  Vitest — pure business logic, no I/O
        └───────────────┘
```

## 2. Unit tests (Vitest)

Pure functions/business logic with no I/O — the highest-value, cheapest tests given the brief's emphasis on correctness of money/stock logic:

- Price calculation (line totals, discount application, tax application) — table-driven tests covering rounding edge cases (minor-unit integer math, `DATABASE.md` §5).
- Discount/coupon eligibility rules.
- Order and Payment state-machine transition validity (illegal transitions must throw, e.g. `SHIPPED → PENDING_PAYMENT`).
- Inventory availability math (`onHand - reserved`).
- Zod schemas in `packages/validation` — valid/invalid fixture coverage.

## 3. Integration tests (Vitest + Testcontainers)

Real PostgreSQL (via Testcontainers, not a mocked Prisma client — mocking the DB would defeat the point of testing concurrency logic) for:

- **Inventory reservation race conditions**: concurrent checkout attempts against the same limited-stock variant — assert exactly one succeeds, the other sees `insufficient stock`, no negative `onHand` ever occurs. This is the single most important integration test in the system given the brief's explicit concurrency requirement.
- Reservation expiry job correctness (idempotent release, no double-release).
- Webhook idempotency (`WebhookEvent` ledger — same event ID processed twice → one side effect).
- RBAC guard behavior against real role/permission data.
- Cascade/anonymization behavior for GDPR erasure requests.

## 4. API tests (Supertest + Nest testing module)

Boot a real Nest application instance (in-memory, against a test database) and exercise HTTP contracts directly — request validation (bad DTOs rejected with correct status codes), auth/authorization enforcement (401/403 paths), OpenAPI contract conformance. Distinct from integration tests in that these assert on the _HTTP surface_, not internal service calls.

## 5. E2E tests (Playwright)

**Environment note:** the Playwright MCP server failed to connect in the discovery session (`CONNECT_TIMEOUT` after 30s) and was not confirmed reconnected as of Phase 1 start — live browser verification is currently unavailable and needs to be re-established before Phase 1 E2E work begins.

Critical flows (from the brief, all in scope):

1. Browse products (catalog listing, pagination/infinite scroll)
2. Search
3. Category filtering
4. Product detail page (variant selection, image gallery)
5. Add to cart
6. Update cart (quantity change, remove item)
7. Checkout (address, shipping method, payment method selection)
8. Payment success (Stripe test-mode card, and Klarna/Swish test flows once built)
9. Payment failure (declined card, expired reservation mid-checkout)
10. Order creation (post-payment order-confirmation state, verified against DB, not just UI text)
11. Admin login (incl. RBAC-denied login attempt)
12. Product management (admin create/edit/publish/archive)
13. Inventory management (admin stock adjustment, reservation visibility)
14. Order management (admin fulfillment status update, refund issuance)

**Cross-browser:** Chromium, WebKit, Firefox — at minimum the checkout flow (payment-provider iframes/redirects are the most browser-sensitive surface).
**Accessibility:** `@axe-core/playwright` assertions on key pages (home, category, product, cart, checkout) as part of the E2E suite, not a separate manual-only process (`DESIGN_SYSTEM.md` §7).
**Locale coverage:** the checkout flow is run against both locales (`sv-SE`/`en` — `fr-FR` removed, ADR-021) given the multilingual requirement — i18n bugs concentrate in forms and error messages, not just static copy. Admin flows (11–14) are also covered in both locales since `apps/admin` is confirmed bilingual (`PRODUCT_SPEC.md` §5).

## 6. Test data & environments

- Testcontainers for integration/API tests — no shared mutable test database.
- Stripe test mode (test API keys, Stripe CLI for local webhook forwarding) for payment E2E — never live keys in CI.
- Seed scripts (`packages/database`) produce a deterministic catalog/order fixture set reused across integration and E2E suites, versioned alongside schema changes so fixtures don't silently drift from the real schema.

## 7. CI gating

All four layers run in CI (`DEPLOYMENT.md` §CI/CD pipeline); a PR cannot merge with a failing test at any layer. E2E runs against a preview deployment (or a docker-compose-orchestrated stack) rather than against production-adjacent infrastructure.
