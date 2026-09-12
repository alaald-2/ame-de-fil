import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminCustomersController } from "./admin-customers.controller.ts";
import { AdminCustomersService } from "./admin-customers.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

// Real SessionAuthGuard + PermissionsGuard + CsrfGuard, wired in the exact
// order app.module.ts uses — mirrors admin-orders/admin-audit-log
// controller specs. Only SessionService and AdminCustomersService are
// mocked.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getDetail = vi.fn().mockResolvedValue({ id: "user-1", email: "anna@example.com" });

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminCustomersController],
    providers: [
      { provide: AdminCustomersService, useValue: { list, getDetail } },
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
  return { app, list, getDetail };
}

const AUTH_NO_PERMISSIONS: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: [],
};

// Deliberately not the same permission as any other admin resource.
const AUTH_WITH_ORDERS_VIEW: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["orders.view"],
};

const AUTH_WITH_CUSTOMERS_VIEW: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["customers.view"],
};

describe("GET /admin/customers — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/customers");

    expect(response.status).toBe(401);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 403 for a session with no permissions", async () => {
    const booted = await bootApp(async () => AUTH_NO_PERMISSIONS);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  // customers.view is its own permission, not implied by any other admin
  // view permission (admin-customers.controller.ts).
  it("returns 403 for a session with orders.view but not customers.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ORDERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 200 for a session with customers.view — GET needs no CSRF header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_CUSTOMERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20, undefined);
  });

  it("passes page/pageSize query params through to the service", async () => {
    const booted = await bootApp(async () => AUTH_WITH_CUSTOMERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers?page=2&pageSize=5")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(2, 5, undefined);
  });

  it("returns 400 for a pageSize over the cap, before the service is ever called", async () => {
    const booted = await bootApp(async () => AUTH_WITH_CUSTOMERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers?pageSize=999")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(400);
    expect(booted.list).not.toHaveBeenCalled();
  });
});

describe("GET /admin/customers/:id — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/customers/user-1");

    expect(response.status).toBe(401);
    expect(booted.getDetail).not.toHaveBeenCalled();
  });

  it("returns 403 for a session with orders.view but not customers.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ORDERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers/user-1")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.getDetail).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a session with customers.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_CUSTOMERS_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers/user-1")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.getDetail).toHaveBeenCalledWith("user-1");
  });

  it("returns 404 when the service reports no such customer", async () => {
    const booted = await bootApp(async () => AUTH_WITH_CUSTOMERS_VIEW);
    app = booted.app;
    booted.getDetail.mockRejectedValueOnce(
      new NotFoundException({ error: "CustomerNotFound", message: "Customer not found" }),
    );

    const response = await supertest(app.getHttpServer())
      .get("/admin/customers/missing")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(404);
  });
});
