import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { AuthContext } from "./types/auth-context.ts";

// Shared by cart and checkout (moved here once checkout needed the same
// resolution — a request's cart must be identified identically by both:
// checkout reads "the caller's own current cart," never anything the
// client submits). Exactly one branch is ever populated — Cart.userId and
// Cart.guestToken are both unique-nullable columns, never both set on the
// same row (DATABASE.md cart model). Authenticated identity always wins
// over any guest cookie still present from earlier anonymous browsing:
// this phase deliberately does not merge a pre-existing guest cart into a
// newly-logged-in user's cart — that guest cart, if any, is simply abandoned.
export type CartIdentity = { userId: string } | { guestToken: string };

export interface CartCookieOptions {
  cookieName: string;
  ttlDays: number;
  secure: boolean;
}

// The Prisma `where` clause for looking up a Cart row by identity — shared
// by cart and checkout so both resolve "whose cart is this" identically.
export function cartIdentityWhere(
  identity: CartIdentity,
): { userId: string } | { guestToken: string } {
  return "userId" in identity ? { userId: identity.userId } : { guestToken: identity.guestToken };
}

// Read-only resolution — never creates a cart or sets a cookie. Used by
// every cart endpoint except add-item (GET must not fabricate a cart for a
// visitor who has never added anything, and update/remove can only ever act
// on a cart that already exists) and by checkout, which only ever reads an
// existing cart — it can never create one.
export function resolveCartIdentity(
  auth: AuthContext | undefined,
  request: Request,
  cookieName: string,
): CartIdentity | undefined {
  if (auth) return { userId: auth.userId };
  const token = (request.cookies as Record<string, string> | undefined)?.[cookieName];
  return token && token.length > 0 ? { guestToken: token } : undefined;
}

// Same resolution, but mints and sets a fresh guest-cart cookie when the
// caller is anonymous and has none yet. Only cart's add-item is allowed to
// do this — it's the one action that legitimately needs a cart to exist.
export function resolveOrCreateCartIdentity(
  auth: AuthContext | undefined,
  request: Request,
  response: Response,
  options: CartCookieOptions,
): CartIdentity {
  const existing = resolveCartIdentity(auth, request, options.cookieName);
  if (existing) return existing;

  const token = randomBytes(24).toString("base64url");
  response.cookie(options.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    maxAge: options.ttlDays * 24 * 60 * 60 * 1000,
  });
  return { guestToken: token };
}
