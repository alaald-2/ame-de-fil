import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { AdminOrdersService } from "./admin-orders.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const ORDER = { id: "order-1", status: OrderStatus.CONFIRMED };
const SHIPMENT = {
  id: "ship-1",
  orderId: "order-1",
  status: ShipmentStatus.IN_TRANSIT,
  carrierName: "PostNord",
  trackingNumber: "ABC123",
  trackingUrl: "https://track.example.com/ABC123",
  shippedAt: new Date("2026-09-10T00:00:00.000Z"),
  deliveredAt: null,
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const orderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const orderFindUniqueOrThrow = vi.fn().mockResolvedValue(ORDER);
  const shipmentCreate = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirst = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirstOrThrow = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentUpdate = vi.fn().mockResolvedValue({ ...SHIPMENT, status: ShipmentStatus.DELIVERED });

  const tx = {
    order: { updateMany: orderUpdateMany },
    shipment: {
      create: shipmentCreate,
      findFirstOrThrow: shipmentFindFirstOrThrow,
      update: shipmentUpdate,
    },
  };

  const prisma = {
    order: { updateMany: orderUpdateMany, findUniqueOrThrow: orderFindUniqueOrThrow },
    shipment: { findFirst: shipmentFindFirst, update: shipmentUpdate },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    ...overrides,
  } as unknown as PrismaService;

  return {
    prisma,
    orderUpdateMany,
    orderFindUniqueOrThrow,
    shipmentCreate,
    shipmentFindFirst,
    shipmentFindFirstOrThrow,
    shipmentUpdate,
  };
}

describe("AdminOrdersService.markReadyToShip", () => {
  it("transitions CONFIRMED -> READY_TO_SHIP", async () => {
    const { prisma, orderUpdateMany } = makePrismaMock();
    const service = new AdminOrdersService(prisma);

    const result = await service.markReadyToShip("order-1");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION] } },
      data: { status: OrderStatus.READY_TO_SHIP },
    });
    expect(result.orderId).toBe("order-1");
  });

  it("throws when the order is not CONFIRMED or IN_PRODUCTION", async () => {
    const { prisma } = makePrismaMock({
      order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    const service = new AdminOrdersService(prisma);

    await expect(service.markReadyToShip("order-1")).rejects.toThrow(ConflictException);
  });
});

describe("AdminOrdersService.markShipped", () => {
  const INPUT = { carrierName: "PostNord", trackingNumber: "ABC123" };

  it("transitions READY_TO_SHIP -> SHIPPED and creates a Shipment record", async () => {
    const { prisma, shipmentCreate } = makePrismaMock();
    const service = new AdminOrdersService(prisma);

    await service.markShipped("order-1", INPUT);

    expect(shipmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order-1",
        status: ShipmentStatus.IN_TRANSIT,
        carrierName: "PostNord",
        trackingNumber: "ABC123",
        trackingUrl: null,
      }),
    });
  });

  it("creates a Shipment even with no carrier/tracking info supplied (all optional)", async () => {
    const { prisma, shipmentCreate } = makePrismaMock();
    const service = new AdminOrdersService(prisma);

    await service.markShipped("order-1", {});

    expect(shipmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ carrierName: null, trackingNumber: null, trackingUrl: null }),
    });
  });

  it("throws when the order is not READY_TO_SHIP, without creating a Shipment", async () => {
    const orderUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const shipmentCreate = vi.fn();
    const tx = { order: { updateMany: orderUpdateMany }, shipment: { create: shipmentCreate } };
    const prisma = {
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const service = new AdminOrdersService(prisma);

    await expect(service.markShipped("order-1", INPUT)).rejects.toThrow(ConflictException);
    expect(shipmentCreate).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.markDelivered", () => {
  it("transitions SHIPPED -> DELIVERED and updates the most recent Shipment", async () => {
    const { prisma, shipmentFindFirstOrThrow, shipmentUpdate } = makePrismaMock();
    const service = new AdminOrdersService(prisma);

    await service.markDelivered("order-1");

    expect(shipmentFindFirstOrThrow).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(shipmentUpdate).toHaveBeenCalledWith({
      where: { id: "ship-1" },
      data: { status: ShipmentStatus.DELIVERED, deliveredAt: expect.any(Date) },
    });
  });

  it("throws when the order is not SHIPPED, without touching any Shipment", async () => {
    const orderUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const shipmentFindFirstOrThrow = vi.fn();
    const tx = { order: { updateMany: orderUpdateMany }, shipment: { findFirstOrThrow: shipmentFindFirstOrThrow } };
    const prisma = {
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const service = new AdminOrdersService(prisma);

    await expect(service.markDelivered("order-1")).rejects.toThrow(ConflictException);
    expect(shipmentFindFirstOrThrow).not.toHaveBeenCalled();
  });
});
