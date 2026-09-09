# Contributing — Âme de Fil

## Branch strategy

- `main` — always deployable; protected, no direct pushes.
- `feature/<short-description>` — new functionality.
- `fix/<short-description>` — bug fixes.
- `chore/<short-description>` — tooling, dependency bumps, non-functional changes.

Keep branches short-lived and PRs scoped to one logical change. Avoid opening speculative branches for work that isn't started.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) — keeps `docs/DECISIONS.md`-style history readable and enables automated changelog generation later if desired. Commits should be focused and meaningful, not a stream of "wip" commits — squash before merge if your working history is messy.

## Pull requests

- Every PR must pass the full CI gate (`docs/DEPLOYMENT.md` §2: lint, typecheck, unit, integration, build, E2E, security scan) before merge.
- Describe _why_, not just _what_ — the diff already shows what changed.
- Link the relevant `docs/` section if a PR touches an architectural decision; update `docs/DECISIONS.md` if it changes one.
- No secrets, credentials, or `.env` files with real values in a PR, ever — see `docs/SECURITY.md` §7.

## Code style

Enforced via `packages/eslint-config` and Prettier (shared, not per-app) — run `pnpm lint`/`pnpm format` before pushing; CI enforces the same rules. TypeScript strict mode is non-negotiable across all apps/packages.

## Database changes

Prisma schema changes go through `prisma migrate dev` locally and are committed as migration files — never hand-edited SQL migrations, and never `prisma db push` against a shared environment. Migrations are additive/expand-first where possible (`docs/DEPLOYMENT.md` §6) to keep rollbacks safe.

## Testing expectations

New business logic ships with unit tests; anything touching inventory/payment/order state ships with an integration test against a real (Testcontainers) database — see `docs/TESTING.md`. A PR that changes a critical user flow (`docs/TESTING.md` §5) should include or update the corresponding Playwright test.
