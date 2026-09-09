import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "ame_session";
const PUBLIC_PATHS = ["/login"];

// Structural authentication boundary only: checks for the session cookie's
// *presence*, not its validity — real validation happens server-side via
// apps/api on the first authenticated API call (a proxy can read an
// httpOnly cookie's existence but can't verify it without calling the API,
// and there's no session-check endpoint to call yet — DECISIONS.md ADR-015).
// A present-but-expired/revoked cookie still gets past this boundary and
// only fails once a real API call 401s — acceptable for this foundation,
// not for the finished product.
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
