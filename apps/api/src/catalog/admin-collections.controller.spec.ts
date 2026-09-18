import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminCollectionsController } from "./admin-collections.controller.ts";
import { AdminCollectionsService } from "./admin-collections.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const VALID_BODY = {
  translations: [{ locale: "sv-SE", name: "Höstkollektion", slug: "hostkollektion" }],
};

// Mirrors admin-categories.controller.spec.ts exactly, driving
// AdminCollectionsController/Service instead.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const create = vi.fn().mockResolvedValue({ id: "col-1" });
  const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getOne = vi.fn().mockResolvedValue({ id: "col-1", translations: [] });
  const update = vi.fn().mockResolvedValue({ id: "col-1", translations: [] });
  const remove = vi.fn().mockResolvedValue(undefined);

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminCollectionsController],
    providers: [
      { provide: AdminCollectionsService, useValue: { create, list, getOne, update, remove } },
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
  return { app, create, list, getOne, update, remove };
}

describe("GET /admin/collections — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking collections.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["orders.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/collections")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with collections.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/collections")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20, undefined);
  });
});

describe("GET /admin/collections/:id — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking collections.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: [],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.getOne).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with collections.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.getOne).toHaveBeenCalledWith("col-1");
  });
});

describe("POST /admin/collections — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/collections")
      .send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(booted.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid session lacking collections.manage (holding only collections.view)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/collections")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.create).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for a valid session with collections.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/collections")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "col-1" });
    expect(booted.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a body missing required fields, before the service is ever called", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/collections")
      .set("Cookie", "ame_session=some-token")
      .send({ translations: [] }); // violates .min(1)

    expect(response.status).toBe(400);
    expect(booted.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /admin/collections/:id — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking collections.manage (holding only collections.view)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.update).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with collections.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(200);
    expect(booted.update).toHaveBeenCalledWith("col-1", VALID_BODY, "user-1", expect.anything());
  });
});

describe("DELETE /admin/collections/:id — authorization", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking collections.manage (holding only collections.view)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.remove).not.toHaveBeenCalled();
  });

  it("returns 204 and calls the service for a valid session with collections.manage", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["collections.manage"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/collections/col-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(204);
    expect(booted.remove).toHaveBeenCalledWith("col-1", "user-1", expect.anything());
  });
});
