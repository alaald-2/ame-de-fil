import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    root: ".",
    // Integration tests (TESTING.md §3) run separately via
    // `pnpm test:integration` / vitest.integration.config.ts — they need
    // Docker (Testcontainers) and are meaningfully slower, matching
    // DEPLOYMENT.md §2's CI pipeline where unit and integration tests are
    // distinct stages. Keeps this default `test` script fast and
    // Docker-independent.
    exclude: [...configDefaults.exclude, "**/*.integration.spec.ts"],
  },
});
