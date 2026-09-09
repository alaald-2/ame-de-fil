import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, PaymentStatus, OrderStatus, StockReservationStatus } from "@ame-de-fil/database";
import { PaymentsWebhookService } from "./payments-webhook.service.ts";
import type { VerifiedWebhookEvent } from "./payment-provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makeTxMock(overrides: Record<string, unknown> = {}) {
  return {
    payment: { findUnique: vi.fn(), updateMany: vi.fn() },
    paymentAttempt: { create: vi.fn() },
    order: { updateMany: vi.fn() },
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

  it("no-ops on a duplicate webhook event ID without opening a transaction", async () => {
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

    it("confirms a made-to-order-only order (zero reservations) with no inventory writes", async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValue([]);

      await service.handle(SUCCEEDED);

      expect(tx.inventoryItem.update).not.toHaveBeenCalled();
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CONFIRMED, confirmedAt: expect.any(Date) },
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
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: "order-1", status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST },
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
});
