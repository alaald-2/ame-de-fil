import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, PaymentStatus, OrderStatus, StockReservationStatus } from "@ame-de-fil/database";
import { PaymentsWebhookService } from "./payments-webhook.service.ts";
import type { VerifiedWebhookEvent } from "./payment-provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makeTxMock(overrides: Record<string, unknown> = {}) {
  return {
    payment: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    paymentAttempt: { create: vi.fn() },
    order: { updateMany: vi.fn() },
    // Defaults to "no made-to-order lines" (DECISIONS.md ADR-030) so every
    // existing PENDING_PAYMENT -> CONFIRMED test keeps asserting CONFIRMED
    // without needing to know about this; tests for the IN_PRODUCTION
    // branch override it explicitly.
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    stockReservation: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    inventoryItem: { update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    webhookEvent: { update: vi.fn() },
    $queryRaw: vi.fn(),
    ...overrides,
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    webhookEvent: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService & { webhookEvent: { create: ReturnType<typeof vi.fn> } };
}

const SUCCEEDED: VerifiedWebhookEvent = {
  providerEventId: "evt_1",
  eventType: "payment_intent.succeeded",
  providerPaymentIntentId: "pi_1",
  outcome: "succeeded",
  raw: { id: "evt_1" },
};

const FAILED: VerifiedWebhookEvent = {
  providerEventId: "evt_2",
  eventType: "payment_intent.payment_failed",
  providerPaymentIntentId: "pi_1",
  outcome: "failed",
  raw: { id: "evt_2" },
};

const CANCELED: VerifiedWebhookEvent = {
  providerEventId: "evt_3",
  eventType: "payment_intent.canceled",
  providerPaymentIntentId: "pi_1",
  outcome: "canceled",
  raw: { id: "evt_3" },
};

const IRRELEVANT: VerifiedWebhookEvent = {
  providerEventId: "evt_4",
  eventType: "charge.dispute.created",
  providerPaymentIntentId: null,
  outcome: "irrelevant",
  raw: { id: "evt_4" },
};

const PAYMENT_METHOD_RECORDED: VerifiedWebhookEvent = {
  providerEventId: "evt_5",
  eventType: "charge.succeeded",
  providerPaymentIntentId: "pi_1",
  outcome: "paymentMethodRecorded",
  paymentMethodType: "klarna",
  raw: { id: "evt_5" },
};

const PAYMENT = { id: "pay-1", orderId: "order-1" };

describe("PaymentsWebhookService.handle", () => {
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: PaymentsWebhookService;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    service = new PaymentsWebhookService(prisma);
  });

  // Regression test for a real Stripe webhook replay: confirmed live against
  // a real Postgres instance via @prisma/adapter-pg (Prisma 7, ADR-009),
  // resending the exact same event ID produced this shape, not the classic
  // `meta.target` shape the test used to assert — the old assertion passed
  // against a shape the real driver never actually produces, masking a 500
  // on every genuine webhook retry (isUniqueConstraintViolation always
  // returned false, so this fell through to `throw error` instead of
  // no-opping).
  it("no-ops on a duplicate webhook event ID (real @prisma/adapter-pg P2002 shape) without opening a transaction", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("duplicate key value violates unique constraint", {
      code: "P2002",
      clientVersion: "7.10.0",
      meta: {
        modelName: "WebhookEvent",
        driverAdapterError: {
          cause: { constraint: { index: "WebhookEvent_pkey" }, table: "WebhookEvent" },
        },
      },
    });
    prisma.webhookEvent.create.mockRejectedValue(p2002);

    await service.handle(SUCCEEDED);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("no-ops on a duplicate webhook event ID (classic meta.target shape) without opening a transaction", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["id"] },
    });
    prisma.webhookEvent.create.mockRejectedValue(p2002);

    await service.handle(SUCCEEDED);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rethrows a webhookEvent.create failure that isn't a duplicate-id violation", async () => {
    prisma.webhookEvent.create.mockRejectedValue(new Error("connection lost"));
    await expect(service.handle(SUCCEEDED)).rejects.toThrow("connection lost");
  });

  it("marks an irrelevant event processed without opening a transaction", async () => {
    prisma.webhookEvent.create.mockResolvedValue({});
    await service.handle(IRRELEVANT);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_4" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("logs and marks processed, with no further writes, when no Payment matches the PaymentIntent id", async () => {
    prisma.webhookEvent.create.mockResolvedValue({});
    tx.payment.findUnique.mockResolvedValue(null);

    await service.handle(SUCCEEDED);

    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { processedAt: expect.any(Date) },
    });
  });

  describe("payment_intent.succeeded", () => {
    beforeEach(() => {
      prisma.webhookEvent.create.mockResolvedValue({});
      tx.payment.findUnique.mockResolvedValue(PAYMENT);
    });

    it("is a no-op past the payment update when the Payment is no longer PENDING (already processed by another delivery)", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.handle(SUCCEEDED);

      expect(tx.paymentAttempt.create).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(tx.webhookEvent.update).toHaveBeenCalled(); // still marked processed
    });

    it("confirms the order and commits stock when every reservation is still PENDING", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValue([
        {
          id: "res-1",
          status: StockReservationStatus.PENDING,
          quantity: 2,
          inventoryItemId: "inv-1",
          orderItemId: "item-1",
        },
      ]);

      await service.handle(SUCCEEDED);

      expect(tx.paymentAttempt.create).toHaveBeenCalledWith({
        data: {
          paymentId: "pay-1",
          status: PaymentStatus.PAID,
          providerEventId: "evt_1",
          rawPayload: SUCCEEDED.raw,
        },
      });
      expect(tx.stockReservation.update).toHaveBeenCalledWith({
        where: { id: "res-1" },
        data: { status: StockReservationStatus.CONSUMED },
      });
      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { onHand: { decrement: 2 }, reserved: { decrement: 2 } },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          inventoryItemId: "inv-1",
          type: "SALE",
          quantity: -2,
          relatedOrderItemId: "item-1",
        },
      });
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CONFIRMED, confirmedAt: expect.any(Date) },
      });
    });

    it("lands a made-to-order-only order (zero reservations) on IN_PRODUCTION, not CONFIRMED, with no inventory writes (DECISIONS.md ADR-030)", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValue([]);
      tx.orderItem.count.mockResolvedValue(1); // has a made-to-order line

      await service.handle(SUCCEEDED);

      expect(tx.orderItem.count).toHaveBeenCalledWith({
        where: { orderId: "order-1", madeToOrder: true },
      });
      expect(tx.inventoryItem.update).not.toHaveBeenCalled();
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.IN_PRODUCTION, confirmedAt: expect.any(Date) },
      });
    });

    it("flags PAYMENT_SUCCEEDED_STOCK_LOST and touches no inventory at all when any reservation already expired", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValue([
        {
          id: "res-1",
          status: StockReservationStatus.PENDING,
          quantity: 1,
          inventoryItemId: "inv-1",
          orderItemId: "item-1",
        },
        {
          id: "res-2",
          status: StockReservationStatus.EXPIRED,
          quantity: 1,
          inventoryItemId: "inv-2",
          orderItemId: "item-2",
        },
      ]);

      await service.handle(SUCCEEDED);

      expect(tx.stockReservation.update).not.toHaveBeenCalled();
      expect(tx.inventoryItem.update).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      // Regression for the reservation-expiry/stock-lost race: matches
      // CANCELED as well as PENDING_PAYMENT, and clears canceledAt. Without
      // this, an order the reservation-expiry sweep already canceled (the
      // sweep releases the expired reservation and cancels the order in
      // the same transaction, racing this exact webhook) would never
      // transition here at all — the guard would silently match zero rows,
      // leaving Payment PAID but Order stuck CANCELED forever (confirmed
      // live against a real database before this fix).
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELED] } },
        data: { status: OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST, canceledAt: null },
      });
    });
  });

  describe("payment_intent.payment_failed / payment_intent.canceled", () => {
    beforeEach(() => {
      prisma.webhookEvent.create.mockResolvedValue({});
      tx.payment.findUnique.mockResolvedValue(PAYMENT);
    });

    it("marks the Payment FAILED and immediately releases PENDING reservations, canceling the order", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.stockReservation.findMany.mockResolvedValue([
        { id: "res-1", inventoryItemId: "inv-1", quantity: 3 },
      ]);
      tx.stockReservation.updateMany.mockResolvedValue({ count: 1 });

      await service.handle(FAILED);

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-1", status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
        where: { id: "res-1", status: StockReservationStatus.PENDING },
        data: { status: StockReservationStatus.EXPIRED },
      });
      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { reserved: { decrement: 3 } },
      });
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CANCELED, canceledAt: expect.any(Date) },
      });
    });

    it("marks the Payment CANCELED for a payment_intent.canceled event", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.stockReservation.findMany.mockResolvedValue([]);

      await service.handle(CANCELED);

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-1", status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELED },
      });
    });

    it("skips a reservation already released by a concurrent sweep instead of double-decrementing", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.stockReservation.findMany.mockResolvedValue([
        { id: "res-1", inventoryItemId: "inv-1", quantity: 3 },
      ]);
      tx.stockReservation.updateMany.mockResolvedValue({ count: 0 }); // already EXPIRED by another process

      await service.handle(FAILED);

      expect(tx.inventoryItem.update).not.toHaveBeenCalled();
      expect(tx.order.updateMany).toHaveBeenCalled(); // order cancellation still attempted
    });

    it("is a no-op past the payment update when the Payment is no longer PENDING", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.handle(FAILED);

      expect(tx.paymentAttempt.create).not.toHaveBeenCalled();
      expect(tx.stockReservation.findMany).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("charge.succeeded (paymentMethodRecorded — ADR-028)", () => {
    beforeEach(() => {
      prisma.webhookEvent.create.mockResolvedValue({});
      tx.payment.findUnique.mockResolvedValue(PAYMENT);
    });

    it("records the actual payment method type onto the Payment row", async () => {
      await service.handle(PAYMENT_METHOD_RECORDED);

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: "pay-1" },
        data: { method: "klarna" },
      });
      // Purely informational — never touches status, order state, or inventory.
      expect(tx.payment.updateMany).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    });

    it("skips the write when paymentMethodType is null", async () => {
      await service.handle({ ...PAYMENT_METHOD_RECORDED, paymentMethodType: null });

      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it("is a safe no-op when no Payment matches the PaymentIntent id", async () => {
      tx.payment.findUnique.mockResolvedValue(null);

      await expect(service.handle(PAYMENT_METHOD_RECORDED)).resolves.not.toThrow();

      expect(tx.payment.update).not.toHaveBeenCalled();
      expect(tx.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: "evt_5" },
        data: { processedAt: expect.any(Date) },
      });
    });
  });
});
