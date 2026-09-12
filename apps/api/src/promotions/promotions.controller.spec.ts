import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { PromotionsController } from "./promotions.controller.ts";
import { PromotionsService } from "./promotions.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const VALID_BODY = { name: "Autumn Sale", percentage: 20, variantIds: ["var-1"] };

// Real SessionAuthGuard + PermissionsGuard, wired exactly as in
// app.module.ts (same boundary admin-products.controller.spec.ts's own
// comment explains) — only SessionService and PromotionsService are mocked.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const create = vi.fn().mockResolvedValue({ id: "promo-1" });
  const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getOne = vi.fn().mockResolvedValue({ id: "promo-1", name: "Autumn Sale" });
  const update = vi.fn().mockResolvedValue({ id: "promo-1", name: "Autumn Sale", active: false });
  const removeVariant = vi.fn().mockResolvedValue({ id: "promo-1", name: "Autumn Sale" });

  const moduleRef = await Test.createTestingModule({
    controllers: [PromotionsController],
    providers: [
      { provide: PromotionsService, useValue: { create, list, getOne, update, removeVariant } },
      { provide: SessionService, useValue: { validateSession } },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === "SESSION_COOKIE_NAME" ? "ame_session" : undefined),
        },
      },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, create, list, getOne, update, removeVariant };
}

describe("POST /admin/promotions — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post("/admin/promotions").send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(booted.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid session lacking promotions.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/promotions")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.create).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for a valid session with promotions.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/promotions")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "promo-1" });
    expect(booted.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a body missing required fields, before the service is ever called", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/promotions")
      .set("Cookie", "ame_session=some-token")
      .send({ name: "Autumn Sale" }); // missing percentage/variantIds

    expect(response.status).toBe(400);
    expect(booted.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-range percentage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/promotions")
      .set("Cookie", "ame_session=some-token")
      .send({ ...VALID_BODY, percentage: 0 });

    expect(response.status).toBe(400);
    expect(booted.create).not.toHaveBeenCalled();
  });
});

describe("GET /admin/promotions — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking promotions.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["orders.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/promotions")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 200 for a valid session with promotions.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/promotions")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20, undefined);
  });
});

describe("PATCH /admin/promotions/:id — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking promotions.manage (promotions.view alone isn't enough)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/promotions/promo-1")
      .set("Cookie", "ame_session=some-token")
      .send({ active: false });

    expect(response.status).toBe(403);
    expect(booted.update).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with promotions.manage — deactivation is just `active: false`", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/promotions/promo-1")
      .set("Cookie", "ame_session=some-token")
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(booted.update).toHaveBeenCalledWith("promo-1", { active: false }, "user-1", expect.anything());
  });
});

describe("DELETE /admin/promotions/:id/variants/:variantId — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking promotions.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/promotions/promo-1/variants/var-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.removeVariant).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with promotions.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["promotions.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/promotions/promo-1/variants/var-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.removeVariant).toHaveBeenCalledWith("promo-1", "var-1", "user-1", expect.anything());
  });
});
