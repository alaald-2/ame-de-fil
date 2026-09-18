import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AddressesController } from "./addresses.controller.ts";
import { AddressesService } from "./addresses.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard.ts";
import { RATE_LIMIT_STORE } from "../common/rate-limit/rate-limit-store.ts";
import { InMemoryRateLimitStore } from "../common/rate-limit/in-memory-rate-limit.store.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const CONFIG_VALUES: Record<string, unknown> = {
  SESSION_COOKIE_NAME: "ame_session",
  CSRF_COOKIE_NAME: "ame_csrf",
};
const AUTH: AuthContext = {
  userId: "user-1",
  sessionId: "s1",
  csrfToken: "csrf-token",
  permissions: [],
};

const ADDRESS = {
  id: "addr-1",
  label: null,
  name: "Ada Lovelace",
  line1: "Storgatan 1",
  line2: null,
  postalCode: "111 22",
  city: "Stockholm",
  country: "SE",
  phone: null,
  isDefault: true,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const listMyAddresses = vi.fn().mockResolvedValue({ items: [ADDRESS] });
  const getMyAddress = vi.fn().mockResolvedValue(ADDRESS);
  const createAddress = vi.fn().mockResolvedValue(ADDRESS);
  const updateAddress = vi.fn().mockResolvedValue(ADDRESS);
  const deleteAddress = vi.fn().mockResolvedValue(undefined);

  const moduleRef = await Test.createTestingModule({
    controllers: [AddressesController],
    providers: [
      {
        provide: AddressesService,
        useValue: { listMyAddresses, getMyAddress, createAddress, updateAddress, deleteAddress },
      },
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
  return { app, listMyAddresses, getMyAddress, createAddress, updateAddress, deleteAddress };
}

// No @Public()/@OptionalAuth() anywhere on this controller — default-deny
// (SessionAuthGuard) is the real thing under test, same posture as
// orders.controller.spec.ts's own "my orders" describe block.
describe("AddressesController — the caller's own address book", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /addresses requires a session — 401 with no cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/addresses");

    expect(response.status).toBe(401);
    expect(booted.listMyAddresses).not.toHaveBeenCalled();
  });

  it("GET /addresses scopes the call to the authenticated caller's own userId", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/addresses")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.listMyAddresses).toHaveBeenCalledWith("user-1");
  });

  it("POST /addresses requires a session and the CSRF header for a mutating request", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const withoutCsrf = await supertest(app.getHttpServer())
      .post("/addresses")
      .set("Cookie", "ame_session=token; ame_csrf=csrf-token")
      .send({
        name: "Ada Lovelace",
        line1: "Storgatan 1",
        postalCode: "111 22",
        city: "Stockholm",
      });
    expect(withoutCsrf.status).toBe(403);
    expect(booted.createAddress).not.toHaveBeenCalled();

    const withCsrf = await supertest(app.getHttpServer())
      .post("/addresses")
      .set("Cookie", "ame_session=token; ame_csrf=csrf-token")
      .set("x-csrf-token", "csrf-token")
      .send({
        name: "Ada Lovelace",
        line1: "Storgatan 1",
        postalCode: "111 22",
        city: "Stockholm",
      });
    expect(withCsrf.status).toBe(201);
    expect(booted.createAddress).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ name: "Ada Lovelace" }),
    );
  });

  it("PATCH /addresses/:addressId scopes the call to the caller's own userId", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/addresses/addr-1")
      .set("Cookie", "ame_session=token; ame_csrf=csrf-token")
      .set("x-csrf-token", "csrf-token")
      .send({ city: "Göteborg" });

    expect(response.status).toBe(200);
    expect(booted.updateAddress).toHaveBeenCalledWith("user-1", "addr-1", { city: "Göteborg" });
  });

  it("DELETE /addresses/:addressId returns 204 and scopes the call to the caller's own userId", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/addresses/addr-1")
      .set("Cookie", "ame_session=token; ame_csrf=csrf-token")
      .set("x-csrf-token", "csrf-token");

    expect(response.status).toBe(204);
    expect(booted.deleteAddress).toHaveBeenCalledWith("user-1", "addr-1");
  });

  it("GET /addresses/:addressId requires a session — 401 with no cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/addresses/addr-1");

    expect(response.status).toBe(401);
    expect(booted.getMyAddress).not.toHaveBeenCalled();
  });
});
