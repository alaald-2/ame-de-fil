import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages are source-only (tier 3, DECISIONS.md ADR-023) — Next
  // must transpile them itself, not treat them as pre-built node_modules.
  transpilePackages: ["@ame-de-fil/ui", "@ame-de-fil/types", "@ame-de-fil/validation"],
  images: {
    // Storage provider deferred (DECISIONS.md ADR-020) — populated once chosen.
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
