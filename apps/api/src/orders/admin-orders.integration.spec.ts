// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminOrdersService against a real database —
// the guarded-update transitions and the Shipment.orderId-is-not-@unique
// assumption (admin-orders.service.ts's `create`-not-`upsert` choice) are
// exactly the kind of thing a mocked Prisma client can't actually verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Currency, Locale, OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import { seedShopFixture, type ShopFixture } from "../test/fixtures.ts";

describe("AdminOrdersService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let service: AdminOrdersService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    service = new AdminOrdersService(db.prisma);
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedConfirmedOrder(): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        guestEmail: "fulfillment-test@example.com",
        locale: Locale.sv_SE,
        status: OrderStatus.CONFIRMED,
        currency: Currency.SEK,
        subtotalMinor: 10000,
        shippingMinor: shop.shippingPriceMinor,
        taxMinor: 0,
        totalMinor: 10000 + shop.shippingPriceMinor,
        shippingMethodId: shop.shippingMethodId,
        shippingName: "Test Testsson",
        shippingLine1: "Testgatan 1",
        shippingPostalCode: "11122",
        shippingCity: "Stockholm",
        billingName: "Test Testsson",
        billingLine1: "Testgatan 1",
        billingPostalCode: "11122",
        billingCity: "Stockholm",
      },
    });
    return order.id;
  }

  it("walks a real order through CONFIRMED -> READY_TO_SHIP -> SHIPPED -> DELIVERED", async () => {
    const orderId = await seedConfirmedOrder();

    await service.markReadyToShip(orderId);
    let order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_TO_SHIP);

    await service.markShipped(orderId, { carrierName: "PostNord", trackingNumber: "ABC123" });
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.SHIPPED);

    const shipment = await db.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(shipment.carrierName).toBe("PostNord");
    expect(shipment.trackingNumber).toBe("ABC123");
    expect(shipment.shippedAt).not.toBeNull();

    await service.markDelivered(orderId);
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.DELIVERED);

    const finalShipment = await db.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(finalShipment.status).toBe(ShipmentStatus.DELIVERED);
    expect(finalShipment.deliveredAt).not.toBeNull();
    // Still exactly one Shipment row — confirms `create` (not accidental
    // duplication) is correct for this v1 one-shipment-per-order flow.
    const shipmentCount = await db.prisma.shipment.count({ where: { orderId } });
    expect(shipmentCount).toBe(1);
  });

  it("rejects shipping an order that's still CONFIRMED (not yet READY_TO_SHIP), with no Shipment created", async () => {
    const orderId = await seedConfirmedOrder();

    await expect(service.markShipped(orderId, {})).rejects.toThrow();

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CONFIRMED); // unchanged
    const shipmentCount = await db.prisma.shipment.count({ where: { orderId } });
    expect(shipmentCount).toBe(0);
  });

  it("rejects delivering an order that hasn't shipped yet", async () => {
    const orderId = await seedConfirmedOrder();
    await service.markReadyToShip(orderId);

    await expect(service.markDelivered(orderId)).rejects.toThrow();

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_TO_SHIP); // unchanged
  });
});
