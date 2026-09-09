import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { OrderStatus, PaymentStatus } from "@ame-de-fil/database";
import { OrdersController } from "./orders.controller.ts";
import { OrdersService } from "./orders.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard.ts";
import { RATE_LIMIT_STORE } from "../common/rate-limit/rate-limit-store.ts";
import { InMemoryRateLimitStore } from "../common/rate-limit/in-memory-rate-limit.store.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const CONFIG_VALUES: Record<string, unknown> = { SESSION_COOKIE_NAME: "ame_session" };
const AUTH: AuthContext = { userId: "user-1", sessionId: "s1", csrfToken: "csrf", permissions: [] };

async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const getStatus = vi
    .fn()
    .mockResolvedValue({ status: OrderStatus.CONFIRMED, payment: { status: PaymentStatus.PAID } });

  const moduleRef = await Test.createTestingModule({
    controllers: [OrdersController],
    providers: [
      { provide: OrdersService, useValue: { getStatus } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: (key: string) => CONFIG_VALUES[key] } },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: RATE_LIMIT_STORE, useClass: InMemoryRateLimitStore },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, getStatus };
}

describe("GET /orders/:orderId/status", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("is reachable by a fully anonymous guest (no session cookie), passing the X-Order-Status-Token header through", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/orders/order-1/status")
      .set("X-Order-Status-Token", "the-guest-token");

    expect(response.status).toBe(200);
    expect(booted.getStatus).toHaveBeenCalledWith("order-1", "the-guest-token", undefined);
  });

  it("resolves the authenticated identity and passes it through, with no CSRF header required for a GET", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/orders/order-1/status")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.getStatus).toHaveBeenCalledWith("order-1", undefined, AUTH);
  });

  it("still returns 401 for a present but invalid session cookie", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/orders/order-1/status")
      .set("Cookie", "ame_session=stale");

    expect(response.status).toBe(401);
    expect(booted.getStatus).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-IP rate limit is exceeded", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    for (let i = 0; i < 5; i++) {
      const ok = await supertest(app.getHttpServer())
        .get("/orders/order-1/status")
        .set("X-Order-Status-Token", "t");
      expect(ok.status).toBe(200);
    }

    const limited = await supertest(app.getHttpServer())
      .get("/orders/order-1/status")
      .set("X-Order-Status-Token", "t");

    expect(limited.status).toBe(429);
  });
});
