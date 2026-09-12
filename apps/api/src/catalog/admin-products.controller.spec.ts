import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AdminProductsController } from "./admin-products.controller.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const VALID_BODY = {
  translations: [{ locale: "sv-SE", name: "Virkad tröja", slug: "virkad-troja" }],
  options: [],
  variants: [
    {
      sku: "SKU-1",
      priceMinor: 29900,
      taxClassCode: "STANDARD",
      selectedOptionValues: {},
      initialStock: 5,
      tracksStock: true,
      isLimitedEdition: false,
    },
  ],
  categoryIds: [],
  collectionIds: [],
};

// Real SessionAuthGuard + PermissionsGuard, wired exactly as in app.module.ts
// (global guards, in the same order) — only SessionService and
// AdminProductsService are mocked. This is the boundary the checkpoint asks
// to keep authoritative: apps/admin's proxy.ts cookie-presence check is UI
// routing only, this guard chain is what actually enforces it.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const createProduct = vi.fn().mockResolvedValue({ id: "prod-1" });
  const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const getOne = vi.fn().mockResolvedValue({ id: "prod-1", status: "DRAFT" });
  const update = vi.fn().mockResolvedValue({ id: "prod-1", status: "PUBLISHED" });
  const uploadImage = vi.fn().mockResolvedValue({
    id: "img-1",
    url: "https://res.cloudinary.com/x/y.jpg",
    altTextSv: null,
    altTextEn: null,
    position: 0,
  });
  const updateImage = vi.fn().mockResolvedValue({
    id: "img-1",
    url: "https://res.cloudinary.com/x/y.jpg",
    altTextSv: "En tröja",
    altTextEn: null,
    position: 0,
  });
  const deleteImage = vi.fn().mockResolvedValue(undefined);
  const deleteProduct = vi.fn().mockResolvedValue(undefined);

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminProductsController],
    providers: [
      {
        provide: AdminProductsService,
        useValue: { createProduct, list, getOne, update, uploadImage, updateImage, deleteImage, deleteProduct },
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
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, createProduct, list, getOne, update, uploadImage, updateImage, deleteImage, deleteProduct };
}

describe("POST /admin/products — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 401 with no session cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post("/admin/products").send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(booted.createProduct).not.toHaveBeenCalled();
  });

  it("returns 401 when the session cookie doesn't correspond to a valid session", async () => {
    const booted = await bootApp(async () => null); // simulates expired/revoked/unknown token
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(booted.createProduct).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid session lacking the products.create permission", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["orders.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.createProduct).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for a valid session with products.create", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.create"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products")
      .set("Cookie", "ame_session=some-token")
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "prod-1" });
    expect(booted.createProduct).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a body missing required fields, before the service is ever called", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.create"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products")
      .set("Cookie", "ame_session=some-token")
      .send({ translations: [] }); // violates .min(1) on translations and variants

    expect(response.status).toBe(400);
    expect(booted.createProduct).not.toHaveBeenCalled();
  });
});

describe("GET /admin/products — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["orders.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/products")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with products.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/products")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20, undefined, undefined);
  });

  it("passes a status query param through to the service", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/products?status=ARCHIVED")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalledWith(1, 20, "ARCHIVED", undefined);
  });
});

describe("GET /admin/products/:id — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: [],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.getOne).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with products.view", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(200);
    expect(booted.getOne).toHaveBeenCalledWith("prod-1");
  });
});

describe("PATCH /admin/products/:id — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.update (holding only products.view)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token")
      .send({ status: "PUBLISHED" });

    expect(response.status).toBe(403);
    expect(booted.update).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token")
      .send({ status: "PUBLISHED" });

    expect(response.status).toBe(200);
    expect(booted.update).toHaveBeenCalledWith("prod-1", { status: "PUBLISHED" }, "user-1", expect.anything());
  });

  it("returns 400 for an invalid status value, before the service is ever called", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token")
      .send({ status: "NOT_A_REAL_STATUS" });

    expect(response.status).toBe(400);
    expect(booted.update).not.toHaveBeenCalled();
  });
});

describe("POST /admin/products/:id/images — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products/prod-1/images")
      .set("Cookie", "ame_session=some-token")
      .attach("file", Buffer.from("fake-image-bytes"), "photo.jpg");

    expect(response.status).toBe(403);
    expect(booted.uploadImage).not.toHaveBeenCalled();
  });

  it("returns 201 and calls the service for a valid session with products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products/prod-1/images")
      .set("Cookie", "ame_session=some-token")
      .field("altTextSv", "En tröja")
      .attach("file", Buffer.from("fake-image-bytes"), "photo.jpg");

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: "img-1",
      url: "https://res.cloudinary.com/x/y.jpg",
      altTextSv: null,
      altTextEn: null,
      position: 0,
    });
    expect(booted.uploadImage).toHaveBeenCalledWith(
      "prod-1",
      expect.objectContaining({ mimetype: "image/jpeg" }),
      { altTextSv: "En tröja" },
      "user-1",
      expect.anything(),
    );
  });

  it("returns 400 when no file is attached, before the service is ever called", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/admin/products/prod-1/images")
      .set("Cookie", "ame_session=some-token")
      .field("altTextSv", "En tröja");

    expect(response.status).toBe(400);
    expect(booted.uploadImage).not.toHaveBeenCalled();
  });
});

describe("PATCH /admin/products/:id/images/:imageId — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/products/prod-1/images/img-1")
      .set("Cookie", "ame_session=some-token")
      .send({ altTextSv: "En tröja" });

    expect(response.status).toBe(403);
    expect(booted.updateImage).not.toHaveBeenCalled();
  });

  it("returns 200 and calls the service for a valid session with products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/admin/products/prod-1/images/img-1")
      .set("Cookie", "ame_session=some-token")
      .send({ altTextSv: "En tröja" });

    expect(response.status).toBe(200);
    expect(booted.updateImage).toHaveBeenCalledWith(
      "prod-1",
      "img-1",
      { altTextSv: "En tröja" },
      "user-1",
      expect.anything(),
    );
  });
});

describe("DELETE /admin/products/:id/images/:imageId — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.view"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/products/prod-1/images/img-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.deleteImage).not.toHaveBeenCalled();
  });

  it("returns 204 and calls the service for a valid session with products.update", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/products/prod-1/images/img-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(204);
    expect(booted.deleteImage).toHaveBeenCalledWith("prod-1", "img-1", "user-1", expect.anything());
  });
});

describe("DELETE /admin/products/:id — authorization", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 403 for a valid session lacking products.delete (products.update alone isn't enough)", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.update"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(403);
    expect(booted.deleteProduct).not.toHaveBeenCalled();
  });

  it("returns 204 and calls the service for a valid session with products.delete", async () => {
    const booted = await bootApp(async () => ({
      userId: "user-1",
      sessionId: "sess-1",
      csrfToken: "csrf",
      permissions: ["products.delete"],
    }));
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/admin/products/prod-1")
      .set("Cookie", "ame_session=some-token");

    expect(response.status).toBe(204);
    expect(booted.deleteProduct).toHaveBeenCalledWith("prod-1", "user-1", expect.anything());
  });
});
