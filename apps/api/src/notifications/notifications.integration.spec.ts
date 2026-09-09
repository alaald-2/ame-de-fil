// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// PendingEmailProvider, not a real SMTP container — Testcontainers/Vitest
// has no ready-made SMTP-catcher module the way @testcontainers/postgresql
// covers Postgres, and standing up one by hand is out of proportion to what
// this suite needs to prove (DECISIONS.md ADR-031). This still exercises
// everything that's actually specific to a real database: the Notification
// row is really created, really updated, and the JSON-payload idempotency
// guard is a real query against real Postgres, not a mocked one — only the
// "a real mail server received the message" leg is out of reach here.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Currency, Locale, NotificationStatus, OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { NotificationsService } from "./notifications.service.ts";
import { PendingEmailProvider } from "./email-provider.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import { seedShopFixture, type ShopFixture } from "../test/fixtures.ts";

describe("NotificationsService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let service: NotificationsService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    service = new NotificationsService(db.prisma, new PendingEmailProvider());
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedOrder(): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        guestEmail: "notifications-test@example.com",
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

  it("creates a real Notification row and resolves it to FAILED (no SMTP available in this harness)", async () => {
    const orderId = await seedOrder();

    await service.sendOrderConfirmation(orderId);

    const notification = await db.prisma.notification.findFirstOrThrow({
      where: { type: "order-confirmation", payload: { path: ["orderId"], equals: orderId } },
    });
    expect(notification.status).toBe(NotificationStatus.FAILED);
    expect(notification.sentAt).toBeNull();
  });

  it("retries and creates a second row after a FAILED attempt — the idempotency guard only blocks resends after a SENT one (DECISIONS.md ADR-031's documented limitation)", async () => {
    const orderId = await seedOrder();

    await service.sendOrderConfirmation(orderId);
    await service.sendOrderConfirmation(orderId);

    const notifications = await db.prisma.notification.findMany({
      where: { type: "order-confirmation", payload: { path: ["orderId"], equals: orderId } },
    });
    // The idempotency guard only ever skips a *successfully sent* row
    // (DECISIONS.md ADR-031) — PendingEmailProvider always fails, so this
    // documents that known limitation directly: two FAILED attempts, not
    // one, since there is nothing here for the guard to have caught yet.
    expect(notifications).toHaveLength(2);
    expect(notifications.every((n) => n.status === NotificationStatus.FAILED)).toBe(true);
  });

  it("creates a shipping-notification Notification row carrying the real Shipment id", async () => {
    const orderId = await seedOrder();
    const shipment = await db.prisma.shipment.create({
      data: {
        orderId,
        status: ShipmentStatus.IN_TRANSIT,
        carrierName: "PostNord",
        trackingNumber: "TEST-TRACK-1",
        shippedAt: new Date(),
      },
    });

    await service.sendShippingNotification(orderId);

    const notification = await db.prisma.notification.findFirstOrThrow({
      where: { type: "shipping-notification", payload: { path: ["orderId"], equals: orderId } },
    });
    expect(notification.status).toBe(NotificationStatus.FAILED);
    expect(notification.payload).toMatchObject({ orderId, shipmentId: shipment.id });
  });
});
