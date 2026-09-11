import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminStoreSettingsController } from "./admin-store-settings.controller.ts";
import { AdminStoreSettingsService } from "./admin-store-settings.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const SETTINGS_ROW = {
  businessName: "Âme de Fil",
  addressLine1: null,
  addressLine2: null,
  postalCode: null,
  city: null,
  country: null,
  orgNumber: null,
  vatNumber: null,
  phone: null,
  email: null,
  showAddress: true,
  showOrgNumber: true,
  showVatNumber: true,
  showPhone: false,
  showEmail: false,
  updatedAt: "2026-09-11T00:00:00.000Z",
};

async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const get = vi.fn().mockResolvedValue(SETTINGS_ROW);
  const update = vi.fn().mockResolvedValue({ ...SETTINGS_ROW, businessName: "New name" });

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminStoreSettingsController],
    providers: [
      { provide: AdminStoreSettingsService, useValue: { get, update } },
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
  return { app, get, update };
}

const AUTH_WITH_VIEW: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["settings.view"],
};

const AUTH_WITH_MANAGE: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["settings.manage"],
};

describe("GET /admin/store-settings — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/store-settings");

    expect(response.status).toBe(401);
    expect(booted.get).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid session lacking settings.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf-secret",
      permissions: ["orders.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/store-settings")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.get).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with settings.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/store-settings")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(SETTINGS_ROW);
    expect(booted.get).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /admin/store-settings — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session with only settings.view, not settings.manage", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/store-settings")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ businessName: "New name" });

    expect(response.status).toBe(403);
    expect(booted.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a matching-csrf request missing the csrf header entirely when required", async () => {
    const booted = await bootApp(async () => AUTH_WITH_MANAGE);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/store-settings")
      .set("Cookie", "ame_session=token")
      .send({ businessName: "New name" });

    expect(response.status).toBe(403);
    expect(booted.update).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with settings.manage and a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_MANAGE);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/store-settings")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ businessName: "New name" });

    expect(response.status).toBe(200);
    expect(response.body.businessName).toBe("New name");
    expect(booted.update).toHaveBeenCalledWith(
      { businessName: "New name" },
      "user-1",
      expect.any(String),
    );
  });

  it("returns 400 for a body with a field over the max length, before the service is ever called", async () => {
    const booted = await bootApp(async () => AUTH_WITH_MANAGE);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/store-settings")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ businessName: "x".repeat(300) });

    expect(response.status).toBe(400);
    expect(booted.update).not.toHaveBeenCalled();
  });
});
