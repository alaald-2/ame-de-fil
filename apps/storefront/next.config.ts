import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// SECURITY.md §8 — scoped precisely to what Stripe.js/Payment Element
// needs (script-src/frame-src/connect-src), not a generic loosened
// default; there was no prior CSP baseline on this app to preserve
// (main.ts's helmet CSP is apps/api's, which never renders Stripe.js at
// all — an unrelated, still-open gap, not this one).
// 'unsafe-inline' on script-src is a deliberate, disclosed trade-off, not
// an oversight: Next.js's App Router injects its own inline bootstrap/RSC
// hydration scripts with no nonce wired through (verified live — omitting
// this blocked Next's own scripts entirely, not just a theoretical gap).
// A nonce-based CSP is the stricter alternative but requires per-request
// middleware plumbing that's a separate, larger piece of work than this
// checkpoint's scope (SECURITY.md §8 flags CSP as needing care, not as
// requiring the nonce approach specifically).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  `connect-src 'self' https://api.stripe.com ${API_URL}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
].join("; ");

const nextConfig: NextConfig = {
  // Workspace packages are source-only (tier 3, DECISIONS.md ADR-023) — Next
  // must transpile them itself, not treat them as pre-built node_modules.
  transpilePackages: ["@ame-de-fil/ui", "@ame-de-fil/types", "@ame-de-fil/validation"],
  images: {
    // Storage provider deferred (DECISIONS.md ADR-020) — populated once chosen.
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
