import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerApiClient } from "./server-api";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: "sv-SE" | "en";
  permissions: string[];
}

export interface AuthenticatedSession {
  user: CurrentUser;
  csrfToken: string;
}

// Server-only Data Access Layer for admin authentication — Next.js's own
// documented pattern for the App Router (next/dist/docs/01-app/02-guides/
// authentication.md, "Creating a Data Access Layer (DAL)"): "the majority
// of security checks should be performed as close as possible to your data
// source," not solely in Proxy. Proxy's own docs are explicit that it
// should stay to an *optimistic*, cookie-presence-only check and must
// avoid real backend/database calls ("to prevent performance issues,"
// since Proxy runs on every request, including prefetches) — see
// proxy.ts's own comment for the full reasoning. This is the real check:
// it calls the backend's actual SessionService.validateSession via
// GET /auth/session, the same live re-validation SessionAuthGuard already
// performs server-side on every API request — a revoked/expired/disabled-
// user session fails here immediately, not just at the caller's next login.
//
// A present-but-invalid session cookie makes the backend throw a 401
// (SessionAuthGuard's own "present but invalid is different from absent"
// distinction) rather than returning `{ authenticated: false }` — both
// outcomes collapse to `null` here, since neither leaves the caller with a
// usable session.
//
// Memoized with React's `cache()` so calling this from both the shared
// layout (for nav permissions) and every individual page (the actual
// enforcement point — see requireSession's own comment for why the layout
// alone isn't sufficient) costs exactly one network call per request, not
// one per call site.
export const getCurrentUser = cache(async (): Promise<AuthenticatedSession | null> => {
  const client = await getServerApiClient();
  const { data, error } = await client.GET("/api/v1/auth/session", { cache: "no-store" });

  if (error || !data.authenticated) return null;
  return { user: data.user, csrfToken: data.csrfToken };
});

// The actual enforcement point for every protected page. Next.js's own
// guidance ("Layouts and auth checks") is explicit that a check performed
// only in a shared layout is not re-verified on client-side navigations
// between sibling routes — the App Router's partial rendering does not
// re-execute a layout that hasn't changed, so a session revoked mid-visit
// would otherwise go unnoticed until a full reload. Every page that needs
// real protection must call this itself; the dashboard layout calling
// getCurrentUser() separately (for nav permissions) does not substitute
// for this.
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  return session;
}
