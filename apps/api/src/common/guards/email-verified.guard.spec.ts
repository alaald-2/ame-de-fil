import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EmailVerifiedGuard } from "./email-verified.guard.ts";
import type { AuthContext } from "../types/auth-context.ts";

function guardFor(auth: AuthContext | undefined, required: boolean | undefined): boolean {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
  return new EmailVerifiedGuard(reflector).canActivate(context);
}

const VERIFIED: AuthContext = {
  userId: "user-1",
  sessionId: "s1",
  csrfToken: "csrf",
  permissions: [],
  emailVerifiedAt: new Date(),
};
const UNVERIFIED: AuthContext = { ...VERIFIED, emailVerifiedAt: null };

describe("EmailVerifiedGuard", () => {
  it("passes when the route doesn't declare @RequireVerifiedEmail()", () => {
    expect(guardFor(UNVERIFIED, undefined)).toBe(true);
  });

  it("passes an anonymous/guest caller regardless of the decorator — nothing to verify yet", () => {
    expect(guardFor(undefined, true)).toBe(true);
  });

  it("passes an authenticated, verified caller", () => {
    expect(guardFor(VERIFIED, true)).toBe(true);
  });

  it("throws a 403 EmailNotVerified for an authenticated, unverified caller", () => {
    expect(() => guardFor(UNVERIFIED, true)).toThrow(ForbiddenException);
    try {
      guardFor(UNVERIFIED, true);
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({ error: "EmailNotVerified" });
    }
  });
});
