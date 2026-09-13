import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPathname } from "../i18n/navigation";
import { getServerApiClient } from "./server-api";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: "sv-SE" | "en";
}

export interface AuthenticatedSession {
  user: CurrentUser;
  csrfToken: string;
}

// Server-only Data Access Layer for customer authentication — mirrors
// apps/admin/src/lib/dal.ts exactly (same API, same session cookie, same
// "call the backend's real GET /auth/session, don't trust cookie presence
// alone" reasoning). Unlike the admin DAL, most storefront pages are
// public — only requireSession's own callers (the account page) actually
// enforce this; everywhere else (e.g. the header's account icon) reads
// getCurrentUser directly and renders either way.
export const getCurrentUser = cache(async (): Promise<AuthenticatedSession | null> => {
  const client = await getServerApiClient();
  const { data, error } = await client.GET("/api/v1/auth/session", { cache: "no-store" });

  if (error || !data.authenticated) return null;
  return { user: data.user, csrfToken: data.csrfToken };
});

// The enforcement point for the account page — same "a shared layout check
// alone isn't re-verified on sibling client-side navigations" reasoning as
// admin's own requireSession (Next.js's own App Router guidance). Only one
// protected route exists today (/account), hence the hardcoded pathname
// key rather than a caller-supplied one — `from` in the resulting /login
// URL is the real, already-localized path (e.g. /mitt-konto for sv-SE),
// not the canonical "/account" key, since LoginForm just pushes it as a
// plain string afterward and a bare canonical key would 404 on any locale
// whose pathname actually differs from it.
export async function requireSession(): Promise<AuthenticatedSession> {
  const [session, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!session) {
    // getPathname (not next-intl's own `redirect`) + plain next/navigation
    // `redirect` — same two-step admin's locale-switcher.tsx already uses
    // for a computed-at-runtime href; next/navigation's redirect is the one
    // whose `never` return type TypeScript actually narrows on here.
    const from = getPathname({ href: "/account", locale });
    redirect(getPathname({ href: { pathname: "/login", query: { from } }, locale }));
  }
  return session;
}
