# apps/admin E2E (Playwright)

Real end-to-end tests against a live `apps/api` + Postgres — nothing here is mocked.

## Running locally

1. `docker compose up -d postgres` (repo root)
2. `apps/api/.env` and `packages/database/.env` from their `.env.example` files
3. `pnpm --filter @ame-de-fil/database migrate:deploy`
4. Seed a bootstrap admin (never committed, never a guessable default):
   ```
   SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD=<a-strong-local-password> \
     pnpm --filter @ame-de-fil/database seed
   ```
5. `pnpm --filter @ame-de-fil/api start` (leave running)
6. From `apps/admin`, with the same credentials from step 4:
   ```
   SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD=<a-strong-local-password> \
     pnpm test:e2e
   ```
   (`playwright.config.ts`'s `webServer` starts `pnpm dev` for you.)

## Scope

One smoke test today (`auth.spec.ts`, TESTING.md §5 item 11): anonymous → redirected to
`/login` → real login → dashboard, plus an `@axe-core/playwright` accessibility check on the
landed page. Chromium only. Every subsequent admin checkpoint (Customers, Orders, …) adds its
own Playwright + axe coverage here rather than deferring it to a later, separate step —
TESTING.md §5's cross-browser/locale coverage expands alongside those, not in this file.
