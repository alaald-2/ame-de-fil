import { describe, expect, it, vi } from "vitest";
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
  it("does nothing and touches no transaction when there is nothing expired", async () => {
    const { prisma } = makePrisma({
      stockReservation: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const service = new ReservationExpiryService(prisma);

    const result = await service.releaseExpiredReservations();

    expect(result).toEqual({ releasedReservations: 0, canceledOrders: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("releases an expired reservation's stock and cancels its still-pending order", async () => {
    const { prisma, txStockReservationUpdateMany, txInventoryItemUpdate, txOrderUpdateMany } =
      makePrisma();
    const service = new ReservationExpiryService(prisma);

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
    const service = new ReservationExpiryService(prisma);

    const result = await service.releaseExpiredReservations();

    expect(txInventoryItemUpdate).not.toHaveBeenCalled();
    expect(result.releasedReservations).toBe(0);
  });

  it("does not re-cancel an order a concurrent sweep already canceled (updateMany matches zero rows)", async () => {
    const { prisma, txOrderUpdateMany } = makePrisma();
    (txOrderUpdateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    const service = new ReservationExpiryService(prisma);

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
    const service = new ReservationExpiryService(prisma);

    const result = await service.releaseExpiredReservations();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2); // one per distinct order
    expect(result).toEqual({ releasedReservations: 2, canceledOrders: 2 });
  });
});
