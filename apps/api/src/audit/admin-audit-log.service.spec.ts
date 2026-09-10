import { describe, expect, it, vi } from "vitest";
import { AdminAuditLogService } from "./admin-audit-log.service.ts";
import { ADMIN_AUDIT_LOG_SELECT } from "./mappers/admin-audit-log.mapper.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrisma(overrides: Record<string, unknown> = {}) {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);

  const prisma = {
    auditLog: { findMany, count, ...(overrides["auditLog"] as object | undefined) },
  };

  return { prisma: prisma as unknown as PrismaService, findMany, count };
}

const ROW_WITH_ACTOR = {
  id: "log-1",
  actorUserId: "user-1",
  actor: { email: "admin@example.com" },
  action: "inventory.adjusted",
  entityType: "InventoryItem",
  entityId: "inv-1",
  before: { onHand: 10 },
  after: { onHand: 15, delta: 5 },
  ipAddress: "127.0.0.1",
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

const ROW_NO_ACTOR = {
  id: "log-2",
  actorUserId: null,
  actor: null,
  action: "checkout.reservations_expired",
  entityType: "ReservationExpirySweep",
  entityId: "sweep-1",
  before: null,
  after: { releasedReservations: 0, canceledOrders: 0 },
  ipAddress: null,
  createdAt: new Date("2026-09-09T00:00:00.000Z"),
};

describe("AdminAuditLogService.list", () => {
  it("queries with the exact admin-safe select, ordered most recent first", async () => {
    const { prisma, findMany, count } = makePrisma();
    const service = new AdminAuditLogService(prisma);

    await service.list(1, 20);

    expect(findMany).toHaveBeenCalledWith({
      select: ADMIN_AUDIT_LOG_SELECT,
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("computes skip from page/pageSize", async () => {
    const { prisma, findMany } = makePrisma();
    const service = new AdminAuditLogService(prisma);

    await service.list(3, 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("maps rows, resolving actorEmail from the actor relation (null when there is no actor)", async () => {
    const { prisma } = makePrisma({
      auditLog: {
        findMany: vi.fn().mockResolvedValue([ROW_WITH_ACTOR, ROW_NO_ACTOR]),
        count: vi.fn().mockResolvedValue(2),
      },
    });
    const service = new AdminAuditLogService(prisma);

    const result = await service.list(1, 20);

    expect(result).toEqual({
      items: [
        {
          id: "log-1",
          actorUserId: "user-1",
          actorEmail: "admin@example.com",
          action: "inventory.adjusted",
          entityType: "InventoryItem",
          entityId: "inv-1",
          before: { onHand: 10 },
          after: { onHand: 15, delta: 5 },
          ipAddress: "127.0.0.1",
          createdAt: "2026-09-10T00:00:00.000Z",
        },
        {
          id: "log-2",
          actorUserId: null,
          actorEmail: null,
          action: "checkout.reservations_expired",
          entityType: "ReservationExpirySweep",
          entityId: "sweep-1",
          before: null,
          after: { releasedReservations: 0, canceledOrders: 0 },
          ipAddress: null,
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it("never surfaces anything beyond the selected actor.email (no passwordHash, no full User object)", async () => {
    const { prisma } = makePrisma({
      auditLog: {
        findMany: vi.fn().mockResolvedValue([ROW_WITH_ACTOR]),
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const service = new AdminAuditLogService(prisma);

    const result = await service.list(1, 20);

    expect(Object.keys(result.items[0]!)).toEqual([
      "id",
      "actorUserId",
      "actorEmail",
      "action",
      "entityType",
      "entityId",
      "before",
      "after",
      "ipAddress",
      "createdAt",
    ]);
  });
});
