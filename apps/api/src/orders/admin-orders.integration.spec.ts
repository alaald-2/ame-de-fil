// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminOrdersService against a real database —
// the guarded-update transitions and the Shipment.orderId-is-not-@unique
// assumption (admin-orders.service.ts's `create`-not-`upsert` choice) are
// exactly the kind of thing a mocked Prisma client can't actually verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Currency, Locale, OrderStatus, PaymentStatus, ShipmentStatus } from "@ame-de-fil/database";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PendingEmailProvider } from "../notifications/email-provider.ts";
import { AuditService } from "../audit/audit.service.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import {
  seedShopFixture,
  seedUserWithPermissions,
  seedVariant,
  type ShopFixture,
  type VariantFixture,
} from "../test/fixtures.ts";

describe("AdminOrdersService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let variant: VariantFixture;
  let service: AdminOrdersService;
  let actorUserId: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    variant = await seedVariant(db.prisma, shop.taxClassId);
    actorUserId = (await seedUserWithPermissions(db.prisma, ["orders.fulfill"])).userId;
    // PendingEmailProvider — no real SMTP container in this harness
    // (TESTING.md §3); NotificationsService never throws, so this can't
    // affect any assertion below about order/shipment state.
    service = new AdminOrdersService(
      db.prisma,
      new NotificationsService(db.prisma, new PendingEmailProvider()),
      new AuditService(db.prisma),
    );
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedConfirmedOrder(status: OrderStatus = OrderStatus.CONFIRMED): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        guestEmail: "fulfillment-test@example.com",
        locale: Locale.sv_SE,
        status,
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

  // Unlike seedConfirmedOrder above (fulfillment tests only need a bare
  // Order row), listOrders/getOrderDetail need a realistic order — an
  // OrderItem and a Payment, and optionally a real registered User —
  // to exercise the actual mapper against real relations.
  async function seedOrderWithDetails(
    options: {
      userId?: string;
      guestEmail?: string;
      createdAt?: Date;
      paymentStatus?: PaymentStatus;
    } = {},
  ): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        userId: options.userId ?? null,
        guestEmail: options.userId ? null : (options.guestEmail ?? "detail-test@example.com"),
        locale: Locale.sv_SE,
        status: OrderStatus.CONFIRMED,
        currency: Currency.SEK,
        subtotalMinor: 10000,
        discountMinor: 0,
        shippingMinor: shop.shippingPriceMinor,
        taxMinor: 2500,
        totalMinor: 10000 + shop.shippingPriceMinor + 2500,
        shippingMethodId: shop.shippingMethodId,
        shippingName: "Detail Testsson",
        shippingLine1: "Testgatan 2",
        shippingPostalCode: "11123",
        shippingCity: "Göteborg",
        shippingPhone: "+46701234567",
        billingName: "Detail Testsson",
        billingLine1: "Testgatan 2",
        billingPostalCode: "11123",
        billingCity: "Göteborg",
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
    });

    await db.prisma.orderItem.create({
      data: {
        orderId: order.id,
        productVariantId: variant.variantId,
        productNameSnapshot: "Testprodukt",
        variantLabelSnapshot: "Standard",
        skuSnapshot: `SKU-${order.id}`,
        unitPriceMinor: 10000,
        quantity: 1,
        taxRatePercent: 25,
        lineSubtotalMinor: 10000,
        lineTotalMinor: 10000,
      },
    });

    await db.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "stripe",
        providerPaymentIntentId: `pi_${order.id}`,
        method: "card",
        status: options.paymentStatus ?? PaymentStatus.PAID,
        amountMinor: order.totalMinor,
        currency: Currency.SEK,
      },
    });

    return order.id;
  }

  it("walks a real order through CONFIRMED -> READY_TO_SHIP -> SHIPPED -> DELIVERED", async () => {
    const orderId = await seedConfirmedOrder();

    await service.markReadyToShip(orderId, actorUserId);
    let order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_TO_SHIP);

    await service.markShipped(orderId, { carrierName: "PostNord", trackingNumber: "ABC123" }, actorUserId);
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.SHIPPED);

    const shipment = await db.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(shipment.carrierName).toBe("PostNord");
    expect(shipment.trackingNumber).toBe("ABC123");
    expect(shipment.shippedAt).not.toBeNull();

    await service.markDelivered(orderId, actorUserId);
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.DELIVERED);

    const finalShipment = await db.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(finalShipment.status).toBe(ShipmentStatus.DELIVERED);
    expect(finalShipment.deliveredAt).not.toBeNull();
    // Still exactly one Shipment row — confirms `create` (not accidental
    // duplication) is correct for this v1 one-shipment-per-order flow.
    const shipmentCount = await db.prisma.shipment.count({ where: { orderId } });
    expect(shipmentCount).toBe(1);

    // One AuditLog row per transition, against the real FK to User — the
    // kind of thing a mocked Prisma client can't verify (RBAC/authorization
    // audit: AuditLog wiring).
    const auditEntries = await db.prisma.auditLog.findMany({
      where: { entityType: "Order", entityId: orderId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual([
      "order.ready_to_ship",
      "order.shipped",
      "order.delivered",
    ]);
    for (const entry of auditEntries) {
      expect(entry.actorUserId).toBe(actorUserId);
    }
  });

  it("rejects shipping an order that's still CONFIRMED (not yet READY_TO_SHIP), with no Shipment created", async () => {
    const orderId = await seedConfirmedOrder();

    await expect(service.markShipped(orderId, {}, actorUserId)).rejects.toThrow();

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CONFIRMED); // unchanged
    const shipmentCount = await db.prisma.shipment.count({ where: { orderId } });
    expect(shipmentCount).toBe(0);
  });

  it("rejects delivering an order that hasn't shipped yet", async () => {
    const orderId = await seedConfirmedOrder();
    await service.markReadyToShip(orderId, actorUserId);

    await expect(service.markDelivered(orderId, actorUserId)).rejects.toThrow();

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_TO_SHIP); // unchanged
  });

  // DECISIONS.md ADR-030: a made-to-order order lands on IN_PRODUCTION at
  // confirmation time — READY_TO_SHIP must be reachable from it directly,
  // not just from CONFIRMED, against the real DB guard (not just a mock
  // that can't distinguish the two WHERE-clause shapes).
  it("walks a real order through IN_PRODUCTION -> READY_TO_SHIP -> SHIPPED -> DELIVERED", async () => {
    const orderId = await seedConfirmedOrder(OrderStatus.IN_PRODUCTION);

    await service.markReadyToShip(orderId, actorUserId);
    let order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_TO_SHIP);

    await service.markShipped(orderId, {}, actorUserId);
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.SHIPPED);

    await service.markDelivered(orderId, actorUserId);
    order = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.DELIVERED);
  });

  describe("listOrders", () => {
    // Year-2099 createdAt timestamps sort before nothing real ever created —
    // this keeps ordering/pagination assertions exact regardless of however
    // many orders earlier tests in this file (or a shared container) have
    // already created, without needing to reset/isolate the database.
    const future = (offsetMinutes: number) => new Date(Date.UTC(2099, 0, 1, 0, offsetMinutes));

    it("lists the most recently created orders first, correctly paginated", async () => {
      const orderIds = [
        await seedOrderWithDetails({ createdAt: future(0) }),
        await seedOrderWithDetails({ createdAt: future(1) }),
        await seedOrderWithDetails({ createdAt: future(2) }),
      ];

      const page1 = await service.listOrders(1, 2);
      expect(page1.items.map((item) => item.orderId)).toEqual([orderIds[2], orderIds[1]]);

      const page2 = await service.listOrders(2, 2);
      expect(page2.items[0]?.orderId).toBe(orderIds[0]);
    });

    it("total reflects the real row count, not a mocked/stale value", async () => {
      const before = await service.listOrders(1, 1);
      await seedOrderWithDetails({});
      await seedOrderWithDetails({});
      const after = await service.listOrders(1, 1);

      expect(after.total).toBe(before.total + 2);
    });
  });

  describe("getOrderDetail", () => {
    it("returns 404 for an order that does not exist", async () => {
      await expect(service.getOrderDetail("nonexistent-order-id")).rejects.toThrow();
    });

    it("maps a full registered-customer order — items, payment, addresses — never leaking a password hash", async () => {
      const customer = await seedUserWithPermissions(db.prisma, []);
      await db.prisma.user.update({
        where: { id: customer.userId },
        data: { firstName: "Anna", lastName: "Andersson" },
      });
      const orderId = await seedOrderWithDetails({ userId: customer.userId });

      const result = await service.getOrderDetail(orderId);

      expect(result.customer).toEqual({
        userId: customer.userId,
        email: customer.email,
        name: "Anna Andersson",
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        productName: "Testprodukt",
        sku: `SKU-${orderId}`,
        quantity: 1,
        unitPrice: { amountMinor: 10000, currency: "SEK" },
      });
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0]).toMatchObject({
        provider: "stripe",
        method: "card",
        status: PaymentStatus.PAID,
        amount: { amountMinor: result.total.amountMinor, currency: "SEK" },
      });
      expect(result.shippingAddress).toMatchObject({ city: "Göteborg", phone: "+46701234567" });
      expect(result.shipments).toEqual([]); // no fulfillment action taken on this order

      // The real passwordHash column has a value (proving this isn't a
      // vacuous check) but never appears anywhere in the mapped response.
      const rawUser = await db.prisma.user.findUniqueOrThrow({ where: { id: customer.userId } });
      expect(rawUser.passwordHash).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain(rawUser.passwordHash);
      expect(Object.keys(result.customer).sort()).toEqual(["email", "name", "userId"]);
    });

    it("maps a guest order's customer from guestEmail, with no userId or name", async () => {
      const orderId = await seedOrderWithDetails({ guestEmail: "real-guest@example.com" });

      const result = await service.getOrderDetail(orderId);

      expect(result.customer).toEqual({ userId: null, email: "real-guest@example.com", name: null });
    });
  });
});
