// Non-httpOnly by design (packages/config/src/env.ts CSRF_COOKIE_NAME
// default) specifically so client-side JS can read it for the double-submit
// header CsrfGuard checks against the cookie — same reasoning and identical
// cookie name as apps/admin/src/lib/csrf.ts (one API, one cookie set,
// readable from either app's own origin since cookie storage in the
// browser is keyed by hostname, not port). CsrfGuard's own header name
// ("x-csrf-token") is a hardcoded constant, not env-configurable, so it's
// hardcoded here too.
const CSRF_COOKIE_NAME = "ame_csrf";

export function readCsrfCookie(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}
