"use client";

import { LOCALE_COOKIE_NAME, type AdminLocale } from "../i18n/config";

// Client-side write side of the cookie apps/admin/src/i18n/request.ts reads
// server-side via `cookies()`. Plain `document.cookie`, not a Server
// Action — this is a pure UI preference with no security implication (a
// tampered value just falls back to DEFAULT_LOCALE in request.ts), so it
// doesn't need the httpOnly/backend-issued treatment ame_session/ame_csrf
// get. A one-year max-age plus `path=/` is what makes the choice survive
// navigation and refresh, including across the login -> authenticated-app
// boundary (same cookie, same path, so nothing else has to carry it).
export function setLocaleCookie(locale: AdminLocale): void {
  const oneYearSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${oneYearSeconds}; SameSite=Lax`;
}
