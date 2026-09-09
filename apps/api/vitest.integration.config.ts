import { defineConfig } from "vitest/config";

// TESTING.md §3 — Integration tests (Vitest + Testcontainers, real
// Postgres). Separate from vitest.config.ts's default `test` run: these
// need Docker and spin up a real container per test file (see
// src/test/testcontainers-postgres.ts), so they're meaningfully slower and
// gated as their own CI stage (DEPLOYMENT.md §2), never mixed into the
// fast unit-test feedback loop.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    root: ".",
    include: ["**/*.integration.spec.ts"],
    // Container startup + migration deploy per file is slow relative to
    // the unit suite's default 5s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
