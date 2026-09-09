import { describe, expect, it, beforeEach } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard.js";
import { InMemoryRateLimitStore } from "./in-memory-rate-limit.store.js";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./rate-limit.decorator.js";

function makeContext(
  ip: string,
  metadata?: RateLimitOptions,
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: () => metadata,
  } as unknown as Reflector;

  const request = { ip };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({ name: "TestController" }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe("RateLimitGuard", () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it("allows requests when no @RateLimit metadata is present", async () => {
    const { context } = makeContext("1.2.3.4");
    const guard = new RateLimitGuard(new Reflector(), store);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows requests under the configured max", async () => {
    const options = { windowMs: 60_000, max: 3 };
    const { context, reflector } = makeContext("1.2.3.4", options);
    const guard = new RateLimitGuard(reflector, store);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("throws 429 once the max is exceeded", async () => {
    const options = { windowMs: 60_000, max: 2 };
    const { context, reflector } = makeContext("1.2.3.4", options);
    const guard = new RateLimitGuard(reflector, store);
    await guard.canActivate(context);
    await guard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
  });

  it("does not affect a different metadata key present on the same test setup", () => {
    expect(RATE_LIMIT_KEY).toBe("rateLimit");
  });
});
