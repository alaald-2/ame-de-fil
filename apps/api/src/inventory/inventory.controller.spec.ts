import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { InventoryController } from "./inventory.controller.ts";
import { InventoryService } from "./inventory.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

// Real SessionAuthGuard + PermissionsGuard + CsrfGuard, wired in the exact
// order app.module.ts uses — only SessionService and InventoryService are
// mocked. This controller has no @OptionalAuth()/@Public() anywhere, so it's
// also the regression fixture for "a normal protected mutation route can
// never become CSRF-exempt" (see csrf.guard.spec.ts for the isolated case).
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getByVariantId = vi.fn().mockResolvedValue({ variantId: "var-1" });
  const adjustStock = vi.fn().mockResolvedValue({ variantId: "var-1", onHand: 15 });

  const moduleRef = await Test.createTestingModule({
    controllers: [InventoryController],
    providers: [
      { provide: InventoryService, useValue: { list, getByVariantId, adjustStock } },
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
  return { app, list, getByVariantId, adjustStock };
}

const AUTH_WITH_VIEW: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["inventory.view"],
};

const AUTH_WITH_ADJUST: AuthContext = {
  userId: "user-1",
  sessionId: "sess-1",
  csrfToken: "csrf-secret",
  permissions: ["inventory.adjust"],
};

describe("GET /admin/inventory — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/inventory");

    expect(response.status).toBe(401);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid session lacking inventory.view", async () => {
    const booted = await bootApp(async () => ({ ...AUTH_WITH_VIEW, permissions: [] }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/inventory")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 200 for a session with inventory.view (GET is CSRF-exempt as a safe method)", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/inventory")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20);
  });
});

describe("POST /admin/inventory/:variantId/adjustments — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const VALID_BODY = { delta: 5, reason: "New shipment", type: "RESTOCK" };

  it("returns 403 for a session with only inventory.view (not inventory.adjust)", async () => {
    const booted = await bootApp(async () => AUTH_WITH_VIEW);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/inventory/var-1/adjustments")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.adjustStock).not.toHaveBeenCalled();
  });

  // Regression test (review follow-up): this route declares no
  // @OptionalAuth()/@Public() at all — a fully authorized, authenticated
  // mutation must still be rejected without a valid CSRF header. Proves the
  // "authenticated mutation → CSRF required" invariant through the real
  // guard chain (SessionAuthGuard -> PermissionsGuard -> CsrfGuard), not
  // just CsrfGuard in isolation.
  it("returns 403 for a fully authorized, authenticated request with NO csrf header at all", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ADJUST);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/inventory/var-1/adjustments")
      .set("Cookie", "ame_session=token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.adjustStock).not.toHaveBeenCalled();
  });

  it("returns 403 for a fully authorized, authenticated request with a mismatched csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ADJUST);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/inventory/var-1/adjustments")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "wrong-token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.adjustStock).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for a session with inventory.adjust and a matching csrf header", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ADJUST);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/inventory/var-1/adjustments")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(booted.adjustStock).toHaveBeenCalledWith("var-1", VALID_BODY, "user-1", expect.any(String));
  });

  it("returns 400 for a zero delta, before the service is ever called", async () => {
    const booted = await bootApp(async () => AUTH_WITH_ADJUST);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/inventory/var-1/adjustments")
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf-secret")
      .send({ delta: 0, reason: "New shipment", type: "RESTOCK" });

    expect(response.status).toBe(400);
    expect(booted.adjustStock).not.toHaveBeenCalled();
  });
});
