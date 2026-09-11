import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminOrdersController } from "./admin-orders.controller.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

// Real SessionAuthGuard + PermissionsGuard + CsrfGuard, wired in the exact
// order app.module.ts uses — only SessionService and AdminOrdersService are
// mocked (mirrors inventory.controller.spec.ts). No @OptionalAuth()/@Public()
// on this controller, so a fully authorized request still needs CSRF.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const markReadyToShip = vi.fn().mockResolvedValue({ orderId: "order-1", status: "READY_TO_SHIP", shipment: null });
  const markShipped = vi.fn().mockResolvedValue({ orderId: "order-1", status: "SHIPPED", shipment: {} });
  const markDelivered = vi.fn().mockResolvedValue({ orderId: "order-1", status: "DELIVERED", shipment: {} });
  const listOrders = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getOrderDetail = vi.fn().mockResolvedValue({ orderId: "order-1", status: "CONFIRMED" });
  const exportOrdersCsv = vi.fn().mockResolvedValue("Order number\r\n");

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminOrdersController],
    providers: [
      {
        provide: AdminOrdersService,
        useValue: {
          markReadyToShip,
          markShipped,
          markDelivered,
          listOrders,
          getOrderDetail,
          exportOrdersCsv,
        },
      },
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
  return {
    app,
    markReadyToShip,
    markShipped,
    markDelivered,
    listOrders,
    getOrderDetail,
    exportOrdersCsv,
  };
}

const AUTH_NO_PERMISSIONS: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: [],
};

const AUTH_WITH_FULFILL: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["orders.fulfill"],
};

const AUTH_WITH_VIEW: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["orders.view"],
};

describe("GET /admin/orders — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/orders");

    expect(response.status).toBe(401);
    expect(booted.listOrders).not.toHaveBeenCalled();
  });

  it("returns 403 for a session lacking orders.view", async () => {
    const booted = await bootApp(async () => AUTH_NO_PERMISSIONS);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.listOrders).not.toHaveBeenCalled();
  });

  // orders.fulfill and orders.view are deliberately separate permissions
  // (admin-orders.controller.ts) — holding one must not implicitly grant
  // the other.
  it("returns 403 for a session with only orders.fulfill, not orders.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.listOrders).not.toHaveBeenCalled();
  });

  it("returns 200 for a session with orders.view — GET needs no CSRF header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.listOrders).toHaveBeenCalledWith(1, 20, undefined, undefined);
  });

  it("passes page/pageSize query params through to the service", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders?page=2&pageSize=5")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.listOrders).toHaveBeenCalledWith(2, 5, undefined, undefined);
  });

  it("passes paymentStatus/refundStatus filters through to the service", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders?paymentStatus=DISPUTED&refundStatus=FAILED")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.listOrders).toHaveBeenCalledWith(1, 20, "DISPUTED", "FAILED");
  });

  it("returns 400 for an invalid paymentStatus value", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders?paymentStatus=NOT_A_REAL_STATUS")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(400);
    expect(booted.listOrders).not.toHaveBeenCalled();
  });

  it("returns 400 for a pageSize over the cap", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders?pageSize=999")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(400);
    expect(booted.listOrders).not.toHaveBeenCalled();
  });
});

describe("GET /admin/orders/:orderId — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/orders/order-1");

    expect(response.status).toBe(401);
    expect(booted.getOrderDetail).not.toHaveBeenCalled();
  });

  it("returns 403 for a session with only orders.fulfill, not orders.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/order-1")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.getOrderDetail).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a session with orders.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/order-1")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.getOrderDetail).toHaveBeenCalledWith("order-1");
  });

  it("returns 404 when the service reports no such order", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;
    booted.getOrderDetail.mockRejectedValueOnce(
      new NotFoundException({ error: "OrderNotFound", message: "Order not found" }),
    );

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/missing")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(404);
  });
});

describe("POST /admin/orders/:orderId/ready-to-ship — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post("/admin/orders/order-1/ready-to-ship");

    expect(response.status).toBe(401);
    expect(booted.markReadyToShip).not.toHaveBeenCalled();
  });

  it("returns 403 for a session lacking orders.fulfill", async () => {
    const booted = await bootApp(async () => AUTH_NO_PERMISSIONS);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ready-to-ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret");

    expect(response.status).toBe(403);
    expect(booted.markReadyToShip).not.toHaveBeenCalled();
  });

  it("returns 403 for a fully authorized request with no csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ready-to-ship")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.markReadyToShip).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a session with orders.fulfill and a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ready-to-ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret");

    expect(response.status).toBe(200);
    expect(booted.markReadyToShip).toHaveBeenCalledWith("order-1", "user-1", expect.any(String));
  });
});

describe("POST /admin/orders/:orderId/ship", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 without orders.fulfill", async () => {
    const booted = await bootApp(async () => AUTH_NO_PERMISSIONS);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ carrierName: "PostNord" });

    expect(response.status).toBe(403);
    expect(booted.markShipped).not.toHaveBeenCalled();
  });

  it("returns 200 and passes the body through to the service", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const body = { carrierName: "PostNord", trackingNumber: "ABC123" };
    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send(body);

    expect(response.status).toBe(200);
    expect(booted.markShipped).toHaveBeenCalledWith("order-1", body, "user-1", expect.any(String));
  });

  it("returns 400 for an invalid trackingUrl, before the service is ever called", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ trackingUrl: "not-a-url" });

    expect(response.status).toBe(400);
    expect(booted.markShipped).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty body (all fields optional)", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/ship")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({});

    expect(response.status).toBe(200);
    expect(booted.markShipped).toHaveBeenCalledWith("order-1", {}, "user-1", expect.any(String));
  });
});

describe("POST /admin/orders/:orderId/deliver", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 without orders.fulfill", async () => {
    const booted = await bootApp(async () => AUTH_NO_PERMISSIONS);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/deliver")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret");

    expect(response.status).toBe(403);
    expect(booted.markDelivered).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a session with orders.fulfill and a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/orders/order-1/deliver")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret");

    expect(response.status).toBe(200);
    expect(booted.markDelivered).toHaveBeenCalledWith("order-1", "user-1", expect.any(String));
  });
});

describe("GET /admin/orders/export — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get(
      "/admin/orders/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
    );

    expect(response.status).toBe(401);
    expect(booted.exportOrdersCsv).not.toHaveBeenCalled();
  });

  it("returns 403 for a session with only orders.fulfill, not orders.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_FULFILL);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.exportOrdersCsv).not.toHaveBeenCalled();
  });

  it("returns 400 for a range where from is not before to, before the service is ever called", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/export?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(400);
    expect(booted.exportOrdersCsv).not.toHaveBeenCalled();
  });

  it("returns 200 with CSV headers and the service's output for a session with orders.view", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/orders/export?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain("orders-2026-09-01-2026-10-01.csv");
    expect(response.text).toBe("Order number\r\n");
    expect(booted.exportOrdersCsv).toHaveBeenCalledWith(
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.000Z"),
    );
  });
});
