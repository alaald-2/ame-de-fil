import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { ProductsController } from "./products.controller.ts";
import { ProductsService } from "./products.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";

async function bootApp(productsService: Partial<ProductsService>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [{ provide: ProductsService, useValue: productsService }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe("GET /products — public, contract behavior", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("is reachable with no session cookie at all (public catalog browsing)", async () => {
    app = await bootApp({
      list: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
    });

    const response = await supertest(app.getHttpServer())
      .get("/products")
      .query({ locale: "sv-SE" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it("returns 400 for an unsupported locale (fr-FR removed — DECISIONS.md ADR-021)", async () => {
    app = await bootApp({ list: vi.fn() });

    const response = await supertest(app.getHttpServer())
      .get("/products")
      .query({ locale: "fr-FR" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("ValidationError");
  });

  it("returns 400 when locale is missing entirely", async () => {
    app = await bootApp({ list: vi.fn() });

    const response = await supertest(app.getHttpServer()).get("/products");

    expect(response.status).toBe(400);
  });

  it("defaults page/pageSize when omitted", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    app = await bootApp({ list });

    await supertest(app.getHttpServer()).get("/products").query({ locale: "en" });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, locale: "en" }),
    );
  });

  it("propagates a 404 from the service for GET /products/:slug", async () => {
    const { NotFoundException } = await import("@nestjs/common");
    app = await bootApp({
      getBySlug: vi
        .fn()
        .mockRejectedValue(new NotFoundException({ error: "ProductNotFound", message: "no" })),
    });

    const response = await supertest(app.getHttpServer())
      .get("/products/nonexistent-slug")
      .query({ locale: "sv-SE" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ProductNotFound");
  });
});
