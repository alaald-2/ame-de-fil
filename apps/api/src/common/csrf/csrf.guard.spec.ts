import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { CsrfGuard } from "./csrf.guard.ts";
import type { AuthContext } from "../types/auth-context.ts";

function makeContext(
  method: string,
  headers: Record<string, string>,
  auth: AuthContext | undefined,
): ExecutionContext {
  const request = { method, headers, auth };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: {
  isPublic?: boolean;
  skipCsrf?: boolean;
  isOptional?: boolean;
}): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === "isPublic") return metadata.isPublic;
      if (key === "skipCsrf") return metadata.skipCsrf;
      if (key === "optionalAuth") return metadata.isOptional;
      return undefined;
    },
  } as unknown as Reflector;
}

const AUTH: AuthContext = { userId: "u1", sessionId: "s1", csrfToken: "secret", permissions: [] };

describe("CsrfGuard", () => {
  it("allows safe methods unconditionally", () => {
    const guard = new CsrfGuard(makeReflector({}));
    expect(guard.canActivate(makeContext("GET", {}, undefined))).toBe(true);
  });

  it("allows @Public() routes regardless of token", () => {
    const guard = new CsrfGuard(makeReflector({ isPublic: true }));
    expect(guard.canActivate(makeContext("POST", {}, undefined))).toBe(true);
  });

  it("allows @SkipCsrf() routes regardless of token", () => {
    const guard = new CsrfGuard(makeReflector({ skipCsrf: true }));
    expect(guard.canActivate(makeContext("POST", {}, undefined))).toBe(true);
  });

  it("allows an anonymous @OptionalAuth() caller (no request.auth) through unchecked", () => {
    const guard = new CsrfGuard(makeReflector({ isOptional: true }));
    expect(guard.canActivate(makeContext("POST", {}, undefined))).toBe(true);
  });

  it("still enforces CSRF for an authenticated caller on an @OptionalAuth() route", () => {
    const guard = new CsrfGuard(makeReflector({ isOptional: true }));
    expect(guard.canActivate(makeContext("POST", {}, AUTH))).toBe(false);
    expect(guard.canActivate(makeContext("POST", { "x-csrf-token": "secret" }, AUTH))).toBe(true);
  });

  // Regression test for the exact flaw flagged in review: the bypass must be
  // gated on the route's own declared @OptionalAuth() metadata, never merely
  // inferred from request.auth being undefined. A normal protected mutation
  // route (no @Public()/@OptionalAuth() declared at all) must fail closed
  // even if request.auth is somehow absent — it must never silently become
  // CSRF-exempt just because the auth guard didn't run or didn't populate it.
  it("rejects a request with no request.auth on a route with NO @OptionalAuth()/@Public() declared — never an implicit bypass", () => {
    const guard = new CsrfGuard(makeReflector({})); // no metadata at all — a normal protected route
    expect(guard.canActivate(makeContext("POST", {}, undefined))).toBe(false);
  });

  it("rejects an authenticated caller with no csrf header", () => {
    const guard = new CsrfGuard(makeReflector({}));
    expect(guard.canActivate(makeContext("POST", {}, AUTH))).toBe(false);
  });

  it("rejects an authenticated caller with a mismatched csrf header", () => {
    const guard = new CsrfGuard(makeReflector({}));
    expect(guard.canActivate(makeContext("POST", { "x-csrf-token": "wrong" }, AUTH))).toBe(false);
  });

  it("accepts an authenticated caller with the matching csrf header", () => {
    const guard = new CsrfGuard(makeReflector({}));
    expect(guard.canActivate(makeContext("POST", { "x-csrf-token": "secret" }, AUTH))).toBe(true);
  });
});
