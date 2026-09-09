import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { SessionAuthGuard } from "./session-auth.guard.ts";
import type { SessionService } from "../../identity/session.service.ts";
import type { AuthContext } from "../types/auth-context.ts";

function makeContext(cookies: Record<string, string>): ExecutionContext {
  const request = { cookies, auth: undefined as AuthContext | undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: { isPublic?: boolean; isOptional?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === "isPublic") return metadata.isPublic;
      if (key === "optionalAuth") return metadata.isOptional;
      return undefined;
    },
  } as unknown as Reflector;
}

const VALID_AUTH: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf",
  permissions: [],
};

function makeSessions(validate: (token: string) => Promise<AuthContext | null>): SessionService {
  return { validateSession: validate } as unknown as SessionService;
}

function makeConfig() {
  return { get: () => "ame_session" } as never;
}

describe("SessionAuthGuard", () => {
  it("denies with 401 when no cookie and no @Public()/@OptionalAuth()", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async () => null),
      makeReflector({}),
      makeConfig(),
    );
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(UnauthorizedException);
  });

  it("allows @Public() routes with no cookie, without setting request.auth", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async () => null),
      makeReflector({ isPublic: true }),
      makeConfig(),
    );
    const context = makeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows @OptionalAuth() routes with no cookie, without setting request.auth", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async () => null),
      makeReflector({ isOptional: true }),
      makeConfig(),
    );
    const context = makeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.auth).toBeUndefined();
  });

  it("populates request.auth on @OptionalAuth() routes when a valid cookie is present", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async (token) => (token === "good-token" ? VALID_AUTH : null)),
      makeReflector({ isOptional: true }),
      makeConfig(),
    );
    const context = makeContext({ ame_session: "good-token" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest().auth).toEqual(VALID_AUTH);
  });

  it("still rejects @OptionalAuth() routes when the cookie is present but invalid — not silently anonymous", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async () => null),
      makeReflector({ isOptional: true }),
      makeConfig(),
    );
    const context = makeContext({ ame_session: "stale-token" });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("populates request.auth on a normal protected route with a valid cookie", async () => {
    const guard = new SessionAuthGuard(
      makeSessions(async () => VALID_AUTH),
      makeReflector({}),
      makeConfig(),
    );
    const context = makeContext({ ame_session: "good-token" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest().auth).toEqual(VALID_AUTH);
  });
});
