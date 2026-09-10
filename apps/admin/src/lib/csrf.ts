// Non-httpOnly by design (packages/config/src/env.ts CSRF_COOKIE_NAME
// default) specifically so client-side JS can read it for the double-submit
// header CsrfGuard checks against the cookie. CsrfGuard's own header name
// ("x-csrf-token", csrf.guard.ts) is a hardcoded constant, not
// env-configurable, so it's hardcoded here too. Shared across every client
// component that performs a mutating request (sign-out, order fulfillment,
// refunds — three real consumers, no longer a one-off).
const CSRF_COOKIE_NAME = "ame_csrf";

export function readCsrfCookie(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}
