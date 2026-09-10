import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { AdminOrdersService } from "./admin-orders.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { NotificationsService } from "../notifications/notifications.service.ts";
import { AuditService } from "../audit/audit.service.ts";

const ACTOR_USER_ID = "user-1";

function makeNotificationsMock() {
  return { sendShippingNotification: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService & {
    sendShippingNotification: ReturnType<typeof vi.fn>;
  };
}

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

// tx exposes the same nested objects as `prisma` (not a separate literal) so
// that a per-test override of e.g. `order` on the returned `prisma` is also
// what the $transaction callback below sees — overrides are read from
// `prisma` at call time, after any override has already been spread in.
function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const orderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const orderFindUniqueOrThrow = vi.fn().mockResolvedValue(ORDER);
  const shipmentCreate = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirst = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirstOrThrow = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentUpdate = vi.fn().mockResolvedValue({ ...SHIPMENT, status: ShipmentStatus.DELIVERED });
  const auditLogCreate = vi.fn().mockResolvedValue({});

  const prisma: Record<string, unknown> = {
    order: { updateMany: orderUpdateMany, findUniqueOrThrow: orderFindUniqueOrThrow },
    shipment: {
      create: shipmentCreate,
      findFirst: shipmentFindFirst,
      findFirstOrThrow: shipmentFindFirstOrThrow,
      update: shipmentUpdate,
    },
    auditLog: { create: auditLogCreate },
    ...overrides,
  };
  prisma["$transaction"] = vi
    .fn()
    .mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ order: prisma["order"], shipment: prisma["shipment"], auditLog: prisma["auditLog"] }),
    );

  return {
    prisma: prisma as unknown as PrismaService,
    orderUpdateMany,
    orderFindUniqueOrThrow,
    shipmentCreate,
    shipmentFindFirst,
    shipmentFindFirstOrThrow,
    shipmentUpdate,
    auditLogCreate,
  };
}

describe("AdminOrdersService.markReadyToShip", () => {
  it("transitions CONFIRMED -> READY_TO_SHIP", async () => {
    const { prisma, orderUpdateMany, auditLogCreate } = makePrismaMock();
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    const result = await service.markReadyToShip("order-1", ACTOR_USER_ID);

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION] } },
      data: { status: OrderStatus.READY_TO_SHIP },
    });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: ACTOR_USER_ID,
          action: "order.ready_to_ship",
          entityType: "Order",
          entityId: "order-1",
        }),
      }),
    );
    expect(result.orderId).toBe("order-1");
  });

  it("throws when the order is not CONFIRMED or IN_PRODUCTION", async () => {
    const { prisma, auditLogCreate } = makePrismaMock({
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(ORDER),
      },
    });
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    await expect(service.markReadyToShip("order-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.markShipped", () => {
  const INPUT = { carrierName: "PostNord", trackingNumber: "ABC123" };

  it("transitions READY_TO_SHIP -> SHIPPED and creates a Shipment record", async () => {
    const { prisma, shipmentCreate } = makePrismaMock();
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    await service.markShipped("order-1", INPUT, ACTOR_USER_ID);

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
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    await service.markShipped("order-1", {}, ACTOR_USER_ID);

    expect(shipmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ carrierName: null, trackingNumber: null, trackingUrl: null }),
    });
  });

  it("sends the shipping notification only after the transaction has committed (DECISIONS.md ADR-031)", async () => {
    const { prisma } = makePrismaMock();
    const notifications = makeNotificationsMock();
    const service = new AdminOrdersService(prisma, notifications, new AuditService(prisma));

    await service.markShipped("order-1", INPUT, ACTOR_USER_ID);

    expect(notifications.sendShippingNotification).toHaveBeenCalledWith("order-1");
    const transactionOrder = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const notifyOrder = notifications.sendShippingNotification.mock.invocationCallOrder[0];
    expect(transactionOrder).toBeDefined();
    expect(notifyOrder).toBeDefined();
    expect(transactionOrder as number).toBeLessThan(notifyOrder as number);
  });

  it("throws when the order is not READY_TO_SHIP, without creating a Shipment or sending a notification", async () => {
    const orderUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const shipmentCreate = vi.fn();
    const tx = { order: { updateMany: orderUpdateMany }, shipment: { create: shipmentCreate } };
    const prisma = {
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const notifications = makeNotificationsMock();
    const service = new AdminOrdersService(prisma, notifications, new AuditService(prisma));

    await expect(service.markShipped("order-1", INPUT, ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(shipmentCreate).not.toHaveBeenCalled();
    expect(notifications.sendShippingNotification).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.markDelivered", () => {
  it("transitions SHIPPED -> DELIVERED and updates the most recent Shipment", async () => {
    const { prisma, shipmentFindFirstOrThrow, shipmentUpdate } = makePrismaMock();
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    await service.markDelivered("order-1", ACTOR_USER_ID);

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
    const service = new AdminOrdersService(prisma, makeNotificationsMock(), new AuditService(prisma));

    await expect(service.markDelivered("order-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(shipmentFindFirstOrThrow).not.toHaveBeenCalled();
  });
});
