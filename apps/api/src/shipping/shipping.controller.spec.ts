import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { ShippingController } from "./shipping.controller.ts";
import { SHIPPING_PROVIDER } from "./shipping-provider.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";

const QUOTE = {
  shippingMethodId: "ship-1",
  code: "STANDARD",
  nameSv: "Standardfrakt",
  nameEn: "Standard shipping",
  priceMinor: 4900,
  currency: "SEK" as const,
  minDeliveryDays: 2,
  maxDeliveryDays: 5,
};

async function bootApp(listAvailableMethods = vi.fn().mockResolvedValue([QUOTE])) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ShippingController],
    providers: [{ provide: SHIPPING_PROVIDER, useValue: { listAvailableMethods } }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, listAvailableMethods };
}

describe("GET /shipping-methods — public, locale-aware", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("is reachable with no session cookie at all", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/shipping-methods")
      .query({ locale: "sv-SE" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: "ship-1",
        code: "STANDARD",
        name: "Standardfrakt",
        price: { amountMinor: 4900, currency: "SEK" },
        minDeliveryDays: 2,
        maxDeliveryDays: 5,
      },
    ]);
  });

  it("returns the English name for locale=en", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/shipping-methods")
      .query({ locale: "en" });

    expect(response.body[0].name).toBe("Standard shipping");
  });

  it("returns 400 when locale is missing", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/shipping-methods");

    expect(response.status).toBe(400);
  });
});
