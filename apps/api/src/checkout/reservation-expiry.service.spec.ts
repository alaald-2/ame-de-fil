import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    inventoryItemId: "inv-1",
    quantity: 2,
    orderItem: { orderId: "order-1" },
    ...overrides,
  };
}

function makeConfig(ttlMinutes = 15): ConfigService<Env, true> {
  return { get: () => ttlMinutes } as unknown as ConfigService<Env, true>;
}

// `order.findMany`/`order.updateMany` here are the top-level abandoned-
// checkout (no-reservation) branch's own calls — distinct from
// `tx.order.updateMany`, which belongs to the reservation-driven branch's
// per-order transaction and is asserted separately.
function makePrisma(overrides: Record<string, unknown> = {}) {
  const txStockReservationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const txInventoryItemUpdate = vi.fn().mockResolvedValue({});
  const txOrderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

  const tx = {
    stockReservation: { updateMany: txStockReservationUpdateMany },
    inventoryItem: { update: txInventoryItemUpdate },
    order: { updateMany: txOrderUpdateMany },
  };

  const prisma = {
    stockReservation: { findMany: vi.fn().mockResolvedValue([makeReservation()]) },
    order: {
      findMany: vi.fn().mockResolvedValue([]), // no stale no-reservation orders by default
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    ...overrides,
  };

  return {
    prisma: prisma as unknown as PrismaService,
    tx,
    txStockReservationUpdateMany,
    txInventoryItemUpdate,
    txOrderUpdateMany,
  };
}

describe("ReservationExpiryService.releaseExpiredReservations", () => {
  it("does nothing and touches no transaction when there is nothing expired or stale", async () => {
    const { prisma } = makePrisma({
      stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const service = new ReservationExpiryService(prisma, makeConfig());

    const result = await service.releaseExpiredReservations();

    expect(result).toEqual({ releasedReservations: 0, canceledOrders: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("releases an expired reservation's stock and cancels its still-pending order", async () => {
    const { prisma, txStockReservationUpdateMany, txInventoryItemUpdate, txOrderUpdateMany } =
      makePrisma();
    const service = new ReservationExpiryService(prisma, makeConfig());

    const result = await service.releaseExpiredReservations();

    expect(txStockReservationUpdateMany).toHaveBeenCalledWith({
      where: { id: "res-1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    expect(txInventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { reserved: { decrement: 2 } },
    });
    expect(txOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING_PAYMENT" },
      data: { status: "CANCELED", canceledAt: expect.any(Date) },
    });
    expect(result).toEqual({ releasedReservations: 1, canceledOrders: 1 });
  });

  it("is idempotent: skips a reservation already claimed by a concurrent sweep, without decrementing stock again", async () => {
    const { prisma, txInventoryItemUpdate, txOrderUpdateMany } = makePrisma();
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction = vi
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({
          stockReservation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, // lost the claim race
          inventoryItem: { update: txInventoryItemUpdate },
          order: { updateMany: txOrderUpdateMany },
        }),
      );
    const service = new ReservationExpiryService(prisma, makeConfig());

    const result = await service.releaseExpiredReservations();

    expect(txInventoryItemUpdate).not.toHaveBeenCalled();
    expect(result.releasedReservations).toBe(0);
  });

  it("does not re-cancel an order a concurrent sweep already canceled (updateMany matches zero rows)", async () => {
    const { prisma, txOrderUpdateMany } = makePrisma();
    (txOrderUpdateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    const service = new ReservationExpiryService(prisma, makeConfig());

    const result = await service.releaseExpiredReservations();

    expect(result.canceledOrders).toBe(0);
  });

  it("processes multiple orders' reservations in independent transactions", async () => {
    const reservations = [
      makeReservation({ id: "res-1", orderItem: { orderId: "order-1" } }),
      makeReservation({ id: "res-2", inventoryItemId: "inv-2", orderItem: { orderId: "order-2" } }),
    ];
    const { prisma } = makePrisma({
      stockReservation: { findMany: vi.fn().mockResolvedValue(reservations) },
    });
    const service = new ReservationExpiryService(prisma, makeConfig());

    const result = await service.releaseExpiredReservations();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2); // one per distinct order
    expect(result).toEqual({ releasedReservations: 2, canceledOrders: 2 });
  });

  // Abandoned-checkout handling for orders a StockReservation can never
  // cover: an order made entirely of made-to-order lines gets none at all
  // (checkout.service.ts only reserves finite-stock lines), so it needs its
  // own cutoff-based branch rather than piggybacking on the reservation
  // query above.
  describe("orders with no reservations at all (fully made-to-order)", () => {
    it("cancels a PENDING_PAYMENT order past the reservation TTL with no reservations", async () => {
      const { prisma } = makePrisma({
        stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
        order: {
          findMany: vi.fn().mockResolvedValue([{ id: "order-mto-1" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      });
      const service = new ReservationExpiryService(prisma, makeConfig(15));

      const result = await service.releaseExpiredReservations();

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "PENDING_PAYMENT",
            items: { every: { reservation: null } },
          }),
        }),
      );
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["order-mto-1"] }, status: "PENDING_PAYMENT" },
        data: { status: "CANCELED", canceledAt: expect.any(Date) },
      });
      expect(result).toEqual({ releasedReservations: 0, canceledOrders: 1 });
    });

    it("does not call order.updateMany when no stale no-reservation orders are found", async () => {
      const { prisma } = makePrisma({
        stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
      });
      const service = new ReservationExpiryService(prisma, makeConfig());

      await service.releaseExpiredReservations();

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("combines both branches' cancellations into one canceledOrders count", async () => {
      const { prisma } = makePrisma({
        order: {
          findMany: vi.fn().mockResolvedValue([{ id: "order-mto-1" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      });
      const service = new ReservationExpiryService(prisma, makeConfig());

      const result = await service.releaseExpiredReservations();

      // 1 from the reservation-driven branch (default mock) + 1 from the
      // no-reservation branch — no new API field, folded into the same count.
      expect(result).toEqual({ releasedReservations: 1, canceledOrders: 2 });
    });
  });
});
