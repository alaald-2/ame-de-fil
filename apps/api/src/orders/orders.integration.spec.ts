// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises OrdersService's "my own orders" methods against a real
// database — the thing worth verifying here is that ownership scoping
// actually holds against real rows (not just a mocked Prisma client's
// `where` argument, which orders.service.spec.ts already covers).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { Currency, Locale, OrderStatus } from "@ame-de-fil/database";
import { OrdersService } from "./orders.service.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import { seedShopFixture, seedUserWithPermissions, type ShopFixture } from "../test/fixtures.ts";
import type { PrismaService } from "../database/prisma.service.ts";

async function seedConfirmedOrder(prisma: PrismaService, shop: ShopFixture, userId: string) {
  return prisma.order.create({
    data: {
      orderNumber: `TEST-${randomUUID()}`,
      userId,
      locale: Locale.sv_SE,
      status: OrderStatus.CONFIRMED,
      currency: Currency.SEK,
      subtotalMinor: 4000,
      shippingMinor: shop.shippingPriceMinor,
      taxMinor: 0,
      totalMinor: 4000 + shop.shippingPriceMinor,
      shippingMethodId: shop.shippingMethodId,
      shippingName: "Test Testsson",
      shippingLine1: "Testgatan 1",
      shippingPostalCode: "11122",
      shippingCity: "Stockholm",
      billingName: "Test Testsson",
      billingLine1: "Testgatan 1",
      billingPostalCode: "11122",
      billingCity: "Stockholm",
      confirmedAt: new Date(),
    },
  });
}

describe("OrdersService — my own orders, real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let service: OrdersService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    service = new OrdersService(db.prisma);
  });

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("listMyOrders only ever returns the caller's own orders, never another customer's", async () => {
    const owner = await seedUserWithPermissions(db.prisma, []);
    const other = await seedUserWithPermissions(db.prisma, []);
    const ownOrder = await seedConfirmedOrder(db.prisma, shop, owner.userId);
    await seedConfirmedOrder(db.prisma, shop, other.userId);

    const result = await service.listMyOrders(owner.userId, 1, 20);

    expect(result.items.map((item) => item.orderId)).toEqual([ownOrder.id]);
  });

  it("getMyOrderDetail returns 404 — never the order's data — for a real order owned by someone else", async () => {
    const owner = await seedUserWithPermissions(db.prisma, []);
    const other = await seedUserWithPermissions(db.prisma, []);
    const order = await seedConfirmedOrder(db.prisma, shop, owner.userId);

    await expect(service.getMyOrderDetail(other.userId, order.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("getMyOrderDetail returns full detail for the order's real owner", async () => {
    const owner = await seedUserWithPermissions(db.prisma, []);
    const order = await seedConfirmedOrder(db.prisma, shop, owner.userId);

    const detail = await service.getMyOrderDetail(owner.userId, order.id);

    expect(detail.orderId).toBe(order.id);
    expect(detail.status).toBe(OrderStatus.CONFIRMED);
  });
});
