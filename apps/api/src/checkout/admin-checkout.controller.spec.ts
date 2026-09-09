import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminCheckoutController } from "./admin-checkout.controller.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const releaseExpiredReservations = vi
    .fn()
    .mockResolvedValue({ releasedReservations: 0, canceledOrders: 0 });

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminCheckoutController],
    providers: [
      { provide: ReservationExpiryService, useValue: { releaseExpiredReservations } },
      { provide: SessionService, useValue: { validateSession } },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === "SESSION_COOKIE_NAME" ? "ame_session" : undefined),
        },
      },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, releaseExpiredReservations };
}

const AUTH_WITH_PERMISSION: AuthContext = {
  userId: "user-1",
  sessionId: "s1",
  csrfToken: "csrf",
  permissions: ["checkout.manage"],
};

describe("POST /admin/checkout/expire-reservations — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post(
      "/admin/checkout/expire-reservations",
    );

    expect(response.status).toBe(401);
    expect(booted.releaseExpiredReservations).not.toHaveBeenCalled();
  });

  it("returns 403 for a session lacking checkout.manage", async () => {
    const booted = await bootApp(async () => ({ ...AUTH_WITH_PERMISSION, permissions: [] }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/checkout/expire-reservations")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf");

    expect(response.status).toBe(403);
    expect(booted.releaseExpiredReservations).not.toHaveBeenCalled();
  });

  it("returns 403 for an authorized session with no csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_PERMISSION);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/checkout/expire-reservations")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.releaseExpiredReservations).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for an authorized session with a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_PERMISSION);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/checkout/expire-reservations")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf");

    expect(response.status).toBe(200);
    expect(booted.releaseExpiredReservations).toHaveBeenCalledTimes(1);
  });
});
