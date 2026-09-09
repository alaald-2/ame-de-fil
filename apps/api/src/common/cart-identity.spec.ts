import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { resolveCartIdentity, resolveOrCreateCartIdentity } from "./cart-identity.ts";
import type { AuthContext } from "./types/auth-context.ts";

const AUTH: AuthContext = { userId: "user-1", sessionId: "s1", csrfToken: "csrf", permissions: [] };

function makeRequest(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

function makeResponse() {
  return { cookie: vi.fn() } as unknown as Response;
}

describe("resolveCartIdentity", () => {
  it("prefers the authenticated user over any guest cookie", () => {
    const identity = resolveCartIdentity(
      AUTH,
      makeRequest({ ame_cart: "guest-token" }),
      "ame_cart",
    );
    expect(identity).toEqual({ userId: "user-1" });
  });

  it("falls back to the guest cookie when there is no auth", () => {
    const identity = resolveCartIdentity(
      undefined,
      makeRequest({ ame_cart: "guest-token" }),
      "ame_cart",
    );
    expect(identity).toEqual({ guestToken: "guest-token" });
  });

  it("returns undefined for a fully anonymous caller with no cookie", () => {
    const identity = resolveCartIdentity(undefined, makeRequest({}), "ame_cart");
    expect(identity).toBeUndefined();
  });
});

describe("resolveOrCreateCartIdentity", () => {
  it("returns the authenticated identity without touching the response", () => {
    const response = makeResponse();
    const identity = resolveOrCreateCartIdentity(AUTH, makeRequest({}), response, {
      cookieName: "ame_cart",
      ttlDays: 30,
      secure: false,
    });

    expect(identity).toEqual({ userId: "user-1" });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("reuses an existing guest cookie without minting a new one", () => {
    const response = makeResponse();
    const identity = resolveOrCreateCartIdentity(
      undefined,
      makeRequest({ ame_cart: "existing-token" }),
      response,
      { cookieName: "ame_cart", ttlDays: 30, secure: false },
    );

    expect(identity).toEqual({ guestToken: "existing-token" });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("mints and sets a fresh guest cookie for a brand-new anonymous caller", () => {
    const response = makeResponse();
    const identity = resolveOrCreateCartIdentity(undefined, makeRequest({}), response, {
      cookieName: "ame_cart",
      ttlDays: 30,
      secure: true,
    });

    expect(identity).toHaveProperty("guestToken");
    expect((identity as { guestToken: string }).guestToken.length).toBeGreaterThan(0);
    expect(response.cookie).toHaveBeenCalledWith(
      "ame_cart",
      (identity as { guestToken: string }).guestToken,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true }),
    );
  });
});
