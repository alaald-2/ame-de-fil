import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "ame_session";
const PUBLIC_PATHS = ["/login"];

// Deliberately an OPTIMISTIC check only — cookie *presence*, not validity —
// per Next.js's own documented guidance for Proxy (next/dist/docs/01-app/
// 02-guides/authentication.md, "Optimistic checks with Proxy"): Proxy runs
// on every request, including prefetches, so it should only read the
// session from the cookie and must avoid a real backend/database call here
// to prevent performance issues. "It should not be your only line of
// defense" — the real, authoritative check (a live GET /auth/session call
// against apps/api, the same validation SessionAuthGuard performs
// server-side) lives in apps/admin/src/lib/dal.ts's requireSession(),
// called from every protected page. This file's job is only the fast,
// no-network redirect for a definitely-anonymous request; a present-but-
// expired/revoked cookie still passes this check and is caught by
// requireSession() instead.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
