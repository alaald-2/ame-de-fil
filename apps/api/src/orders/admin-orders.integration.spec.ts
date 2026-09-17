// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminOrdersService against a real database —
// the guarded-update transitions and the Shipment.orderId-is-not-@unique
// assumption (admin-orders.service.ts's `create`-not-`upsert` choice) are
// exactly the kind of thing a mocked Prisma client can't actually verify.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { Currency, Locale, OrderStatus, PaymentStatus, ShipmentStatus } from "@ame-de-fil/database";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PendingEmailProvider } from "../notifications/email-provider.ts";
import { ManualShippingProvider } from "../shipping/shipping-provider.ts";
import { AuditService } from "../audit/audit.service.ts";
import type {
  PaymentProvider,
  RefundInput,
  RefundResult,
} from "../payments/payment-provider.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import {
  seedShopFixture,
  seedUserWithPermissions,
  seedVariant,
  type ShopFixture,
  type VariantFixture,
} from "../test/fixtures.ts";

// A real, unmocked Stripe call would make refund tests slow, flaky, and
// dependent on network/credentials — exactly what PendingPaymentProvider
// already does for checkout's own real-Postgres tests (checkout-flow.
// integration.spec.ts). Refunds need a controllable outcome per test
// (succeeded/failed/pending) and per-call visibility, which no existing
// PaymentProvider implementation offers, so this one is purpose-built for
// this file only — real Stripe test-mode verification is covered
// separately (STRIPE.md / this checkpoint's report), not by this harness.
class ControllableFakePaymentProvider implements PaymentProvider {
  calls: RefundInput[] = [];
  nextResult: RefundResult | (() => Promise<RefundResult>) = {
    providerRefundId: "re_fake_default",
    status: "succeeded",
  };
  nextError: Error | null = null;

  createPayment(): never {
    throw new Error("not used by AdminOrdersService — refund tests never call createPayment");
  }

  verifyWebhookSignature(): never {
    throw new Error("not used by AdminOrdersService — refund tests never call verifyWebhookSignature");
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.calls.push(input);
    if (this.nextError) throw this.nextError;
    return typeof this.nextResult === "function" ? this.nextResult() : this.nextResult;
  }

  reset() {
    this.calls = [];
    this.nextResult = { providerRefundId: "re_fake_default", status: "succeeded" };
    this.nextError = null;
  }
}

function makeTestConfig(): ConfigService<Env, true> {
  return {
    get: (key: string) => (key === "REFUND_IDEMPOTENCY_TTL_HOURS" ? 1 : undefined),
  } as unknown as ConfigService<Env, true>;
}

describe("AdminOrdersService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let variant: VariantFixture;
  let service: AdminOrdersService;
  let actorUserId: string;
  const paymentProvider = new ControllableFakePaymentProvider();

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    variant = await seedVariant(db.prisma, shop.taxClassId);
    actorUserId = (await seedUserWithPermissions(db.prisma, ["orders.fulfill", "orders.refund"])).userId;
    // PendingEmailProvider — no real SMTP container in this harness
    // (TESTING.md §3); NotificationsService never throws, so this can't
    // affect any assertion below about order/shipment state.
    service = new AdminOrdersService(
      db.prisma,
      new NotificationsService(db.prisma, new PendingEmailProvider(), makeTestConfig()),
      new AuditService(db.prisma),
      paymentProvider,
      // The real ManualShippingProvider, not a mock/stub — always resolves
      // createShipment to null (ADR-022: no external carrier), which is
      // exactly what this harness (no Shipmondo sandbox reachable from
      // Testcontainers) needs: markShipped falls through to its existing
      // manual carrier/tracking behavior, unaffected by ADR-039.
      new ManualShippingProvider(db.prisma),
      makeTestConfig(),
    );
  }, 120_000);

  beforeEach(() => {
    paymentProvider.reset();
  });

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
      status?: OrderStatus;
    } = {},
  ): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        userId: options.userId ?? null,
        guestEmail: options.userId ? null : (options.guestEmail ?? "detail-test@example.com"),
        locale: Locale.sv_SE,
        status: options.status ?? OrderStatus.CONFIRMED,
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

  describe("issueRefund", () => {
    async function paymentFor(orderId: string) {
      return db.prisma.payment.findFirstOrThrow({ where: { orderId } });
    }

    it("rejects a refund amount exceeding the remaining refundable amount, with no Refund row created", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);

      await expect(
        service.issueRefund(orderId, { amountMinor: payment.amountMinor + 1 }, randomUUID(), actorUserId),
      ).rejects.toThrow(BadRequestException);

      expect(paymentProvider.calls).toHaveLength(0);
      const refunds = await db.prisma.refund.findMany({ where: { paymentId: payment.id } });
      expect(refunds).toHaveLength(0);
    });

    it("rejects a refund on a payment that is not PAID or PARTIALLY_REFUNDED", async () => {
      const orderId = await seedOrderWithDetails({ paymentStatus: PaymentStatus.PENDING });

      await expect(service.issueRefund(orderId, { amountMinor: 1000 }, randomUUID(), actorUserId)).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentProvider.calls).toHaveLength(0);
    });

    it("a partial refund succeeds, marks Payment/Order PARTIALLY_REFUNDED, and never restocks", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);
      const inventoryBefore = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });

      const response = await service.issueRefund(
        orderId,
        { amountMinor: 1000, reason: "customer request" },
        randomUUID(),
        actorUserId,
      );

      expect(response.status).toBe("SUCCEEDED");
      expect(response.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(response.orderStatus).toBe(OrderStatus.PARTIALLY_REFUNDED);

      const updatedPayment = await db.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      const updatedOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(updatedOrder.status).toBe(OrderStatus.PARTIALLY_REFUNDED);

      const inventoryAfter = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });
      expect(inventoryAfter.onHand).toBe(inventoryBefore.onHand); // partial refund never restocks

      const auditEntry = await db.prisma.auditLog.findFirst({
        where: { entityType: "Refund", action: "order.refund_issued" },
        orderBy: { createdAt: "desc" },
      });
      expect(auditEntry?.actorUserId).toBe(actorUserId);
    });

    it("a full refund on an unshipped order restocks the returned item", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);
      const inventoryBefore = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });

      const response = await service.issueRefund(orderId, { amountMinor: payment.amountMinor }, randomUUID(), actorUserId);

      expect(response.status).toBe("SUCCEEDED");
      expect(response.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(response.orderStatus).toBe(OrderStatus.REFUNDED);

      const inventoryAfter = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });
      expect(inventoryAfter.onHand).toBe(inventoryBefore.onHand + 1); // seeded order has quantity: 1

      const orderItem = await db.prisma.orderItem.findFirstOrThrow({ where: { orderId } });
      const relatedMovement = await db.prisma.inventoryMovement.findFirst({
        where: { relatedOrderItemId: orderItem.id },
      });
      expect(relatedMovement?.type).toBe("RETURN");
      expect(relatedMovement?.quantity).toBe(1);
    });

    it("a full refund on a shipped order does NOT restock (manual restock only)", async () => {
      const orderId = await seedOrderWithDetails({ status: OrderStatus.SHIPPED });
      const payment = await paymentFor(orderId);
      const inventoryBefore = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });

      const response = await service.issueRefund(orderId, { amountMinor: payment.amountMinor }, randomUUID(), actorUserId);

      expect(response.paymentStatus).toBe(PaymentStatus.REFUNDED);
      const inventoryAfter = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });
      expect(inventoryAfter.onHand).toBe(inventoryBefore.onHand);
    });

    it("a Stripe refund failure marks the Refund FAILED and leaves Payment/Order unchanged", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);
      paymentProvider.nextError = new Error("card_declined");

      await expect(
        service.issueRefund(orderId, { amountMinor: 1000 }, randomUUID(), actorUserId),
      ).rejects.toThrow(UnprocessableEntityException);

      const updatedPayment = await db.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe(PaymentStatus.PAID); // unchanged
      const refund = await db.prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } });
      expect(refund.status).toBe("FAILED");
      const auditEntry = await db.prisma.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id } });
      expect(auditEntry).toBeNull(); // a failed refund never gets Order/Payment/audit effects applied

      // The failed reservation's amount must not remain counted against
      // "remaining" — a later, otherwise-identical refund must be allowed.
      paymentProvider.nextError = null;
      const secondAttempt = await service.issueRefund(
        orderId,
        { amountMinor: payment.amountMinor },
        randomUUID(),
        actorUserId,
      );
      expect(secondAttempt.status).toBe("SUCCEEDED");
    });

    it("replays the exact original result for an identical Idempotency-Key + identical request, without calling Stripe again", async () => {
      const orderId = await seedOrderWithDetails({});
      const key = randomUUID();

      const first = await service.issueRefund(orderId, { amountMinor: 1000, reason: "r1" }, key, actorUserId);
      const second = await service.issueRefund(orderId, { amountMinor: 1000, reason: "r1" }, key, actorUserId);

      expect(second).toEqual(first);
      expect(paymentProvider.calls).toHaveLength(1);
      const refunds = await db.prisma.refund.findMany({ where: { id: first.refundId } });
      expect(refunds).toHaveLength(1);
    });

    it("rejects a re-used Idempotency-Key attached to a different request body with 409", async () => {
      const orderId = await seedOrderWithDetails({});
      const key = randomUUID();

      await service.issueRefund(orderId, { amountMinor: 1000, reason: "r1" }, key, actorUserId);

      await expect(
        service.issueRefund(orderId, { amountMinor: 2000, reason: "different" }, key, actorUserId),
      ).rejects.toThrow(ConflictException);
      expect(paymentProvider.calls).toHaveLength(1); // second call never reached Stripe
    });

    it("self-heals a prior refund that reached SUCCEEDED but never applied its Order/Payment/audit effects", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);

      // Simulates a crash between Txn 2b (Refund -> SUCCEEDED, durable) and
      // Txn 3 (applyRefundEffects) on a *prior* attempt — inserted directly,
      // bypassing the service, so no Order/Payment/audit effects exist yet.
      const orphanedRefund = await db.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: 4000,
          status: "SUCCEEDED",
          providerRefundId: "re_orphaned",
          initiatedByUserId: actorUserId,
        },
      });

      const response = await service.issueRefund(orderId, { amountMinor: 1000 }, randomUUID(), actorUserId);

      // The orphaned refund's effects were applied as a side effect of this
      // new call's reconciliation step, before its own reservation was made.
      const healedAudit = await db.prisma.auditLog.findFirst({
        where: { entityType: "Refund", entityId: orphanedRefund.id },
      });
      expect(healedAudit).not.toBeNull();

      const updatedPayment = await db.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED); // 4000 + 1000 < total
      expect(response.status).toBe("SUCCEEDED");
    });

    // CONCURRENCY / OVER-REFUND PROTECTION (approved design requirement):
    // two concurrent refund requests against the same Payment that together
    // exceed its remaining refundable amount must never both succeed — the
    // Payment row's SELECT ... FOR UPDATE lock (issueRefund's reservation
    // transaction) must serialize them so exactly one wins.
    it("under real concurrent requests, never lets combined SUCCEEDED refunds exceed the payment's amount", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);
      expect(payment.amountMinor).toBeGreaterThan(0);
      const halfPlusOne = Math.floor(payment.amountMinor / 2) + 1; // two of these together exceed the total

      const results = await Promise.allSettled([
        service.issueRefund(orderId, { amountMinor: halfPlusOne }, randomUUID(), actorUserId),
        service.issueRefund(orderId, { amountMinor: halfPlusOne }, randomUUID(), actorUserId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const succeededAgg = await db.prisma.refund.aggregate({
        where: { paymentId: payment.id, status: "SUCCEEDED" },
        _sum: { amountMinor: true },
      });
      expect(succeededAgg._sum.amountMinor ?? 0).toBe(halfPlusOne);
      expect(succeededAgg._sum.amountMinor ?? 0).toBeLessThanOrEqual(payment.amountMinor);
      expect(paymentProvider.calls).toHaveLength(1); // the loser never reached Stripe
    });

    // Distinct from the over-refund race above: here BOTH refunds fit
    // within budget and both succeed at Stripe — the risk is two concurrent
    // applyRefundEffects calls (admin-orders.service.ts) each computing the
    // cumulative SUCCEEDED total from a stale read and independently
    // concluding "this completes the full refund," each restocking the
    // same returned item. The Payment-row lock inside applyRefundEffects
    // must serialize them so the restock (and the REFUNDED transition)
    // happens exactly once.
    it("under two concurrent within-budget refunds that together total the full amount, restocks exactly once", async () => {
      const orderId = await seedOrderWithDetails({});
      const payment = await paymentFor(orderId);
      const half1 = Math.floor(payment.amountMinor / 2);
      const half2 = payment.amountMinor - half1;
      const inventoryBefore = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });

      const results = await Promise.all([
        service.issueRefund(orderId, { amountMinor: half1 }, randomUUID(), actorUserId),
        service.issueRefund(orderId, { amountMinor: half2 }, randomUUID(), actorUserId),
      ]);

      expect(results.every((r) => r.status === "SUCCEEDED")).toBe(true);

      const updatedPayment = await db.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe(PaymentStatus.REFUNDED);
      const updatedOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(updatedOrder.status).toBe(OrderStatus.REFUNDED);

      const inventoryAfter = await db.prisma.inventoryItem.findUniqueOrThrow({
        where: { id: variant.inventoryItemId },
      });
      expect(inventoryAfter.onHand).toBe(inventoryBefore.onHand + 1); // exactly once, not twice

      const orderItem = await db.prisma.orderItem.findFirstOrThrow({ where: { orderId } });
      const movements = await db.prisma.inventoryMovement.findMany({
        where: { relatedOrderItemId: orderItem.id },
      });
      expect(movements).toHaveLength(1);
    });
  });
});
