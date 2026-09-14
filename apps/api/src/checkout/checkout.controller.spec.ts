import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { CheckoutController } from "./checkout.controller.ts";
import { CheckoutService } from "./checkout.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { EmailVerifiedGuard } from "../common/guards/email-verified.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard.ts";
import { RATE_LIMIT_STORE } from "../common/rate-limit/rate-limit-store.ts";
import { InMemoryRateLimitStore } from "../common/rate-limit/in-memory-rate-limit.store.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const CONFIG_VALUES: Record<string, unknown> = {
  SESSION_COOKIE_NAME: "ame_session",
  CART_COOKIE_NAME: "ame_cart",
};

const VALID_BODY = {
  locale: "sv-SE",
  shippingMethodId: "ship-1",
  guestEmail: "anna@example.com",
  shippingAddress: {
    name: "Anna Andersson",
    line1: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
  },
};

async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const initiate = vi.fn().mockResolvedValue({ orderId: "order-1" });

  const moduleRef = await Test.createTestingModule({
    controllers: [CheckoutController],
    providers: [
      { provide: CheckoutService, useValue: { initiate } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: (key: string) => CONFIG_VALUES[key] } },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: EmailVerifiedGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: RATE_LIMIT_STORE, useClass: InMemoryRateLimitStore },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, initiate };
}

const AUTH: AuthContext = {
  userId: "user-1",
  sessionId: "s1",
  csrfToken: "csrf",
  permissions: [],
  emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
};
const UNVERIFIED_AUTH: AuthContext = { ...AUTH, emailVerifiedAt: null };

describe("POST /checkout", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 400 for a fully anonymous caller with no cart cookie at all — nothing to check out", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Idempotency-Key", "key-1")
      .send(VALID_BODY);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("EmptyCart");
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("returns 400 when the Idempotency-Key header is missing", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_cart=guest-token")
      .send(VALID_BODY);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("IdempotencyKeyRequired");
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("resolves a guest identity from the cart cookie and calls the service, CSRF-exempt as an anonymous @OptionalAuth() caller", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_cart=guest-token")
      .set("Idempotency-Key", "key-1")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(booted.initiate).toHaveBeenCalledWith(
      { guestToken: "guest-token" },
      undefined,
      "key-1",
      expect.objectContaining({ shippingMethodId: "ship-1" }),
    );
  });

  it("returns 403 for an authenticated caller's checkout with no csrf header — @OptionalAuth() does not exempt authenticated callers", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_session=token")
      .set("Idempotency-Key", "key-1")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("resolves the authenticated identity and succeeds with a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_session=token")
      .set("Idempotency-Key", "key-1")
      .set("x-csrf-token", "csrf")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(booted.initiate).toHaveBeenCalledWith(
      { userId: "user-1" },
      AUTH,
      "key-1",
      expect.anything(),
    );
  });

  it("returns 403 EmailNotVerified for an authenticated caller who hasn't verified their email", async () => {
    const booted = await bootApp(async () => UNVERIFIED_AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_session=token")
      .set("Idempotency-Key", "key-1")
      .set("x-csrf-token", "csrf")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("EmailNotVerified");
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("still returns 401 when the session cookie is present but invalid", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_session=stale")
      .set("Idempotency-Key", "key-1")
      .send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("returns 400 for a body missing required fields, before the service is ever called", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_cart=guest-token")
      .set("Idempotency-Key", "key-1")
      .send({ locale: "sv-SE" });

    expect(response.status).toBe(400);
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-Swedish shipping address", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_cart=guest-token")
      .set("Idempotency-Key", "key-1")
      .send({ ...VALID_BODY, shippingAddress: { ...VALID_BODY.shippingAddress, country: "DK" } });

    expect(response.status).toBe(400);
    expect(booted.initiate).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-IP rate limit is exceeded", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    for (let i = 0; i < 10; i++) {
      const ok = await supertest(app.getHttpServer())
        .post("/checkout")
        .set("Cookie", "ame_cart=guest-token")
        .set("Idempotency-Key", `key-${i}`)
        .send(VALID_BODY);
      expect(ok.status).toBe(201);
    }

    const limited = await supertest(app.getHttpServer())
      .post("/checkout")
      .set("Cookie", "ame_cart=guest-token")
      .set("Idempotency-Key", "key-limited")
      .send(VALID_BODY);

    expect(limited.status).toBe(429);
  });
});
