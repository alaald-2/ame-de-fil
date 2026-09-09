import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { OrderStatus, PaymentStatus } from "@ame-de-fil/database";
import { OrdersService } from "./orders.service.ts";
import { hashOrderStatusToken } from "../common/order-status-token.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const AUTH: AuthContext = { userId: "user-1", sessionId: "s1", csrfToken: "csrf", permissions: [] };
const RAW_TOKEN = "correct-token-value";
const TOKEN_HASH = hashOrderStatusToken(RAW_TOKEN);

function makePrismaMock(overrides: {
  order?: unknown;
  tokenRecord?: unknown;
} = {}) {
  return {
    order: { findUnique: vi.fn().mockResolvedValue(overrides.order ?? null) },
    orderStatusToken: { findUnique: vi.fn().mockResolvedValue(overrides.tokenRecord ?? null) },
  } as unknown as PrismaService;
}

const ORDER_ROW = {
  userId: "user-1",
  status: OrderStatus.CONFIRMED,
  payments: [{ status: PaymentStatus.PAID }],
};

const GUEST_ORDER_ROW = {
  userId: null,
  status: OrderStatus.PENDING_PAYMENT,
  payments: [{ status: PaymentStatus.PENDING }],
};

describe("OrdersService.getStatus", () => {
  it("returns 404 when the order does not exist at all", async () => {
    const prisma = makePrismaMock({ order: null });
    const service = new OrdersService(prisma);

    await expect(service.getStatus("order-1", undefined, AUTH)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe("authenticated caller — object-level ownership, token never consulted", () => {
    it("returns status for the order's own owner, with no token required", async () => {
      const prisma = makePrismaMock({ order: ORDER_ROW });
      const service = new OrdersService(prisma);

      const result = await service.getStatus("order-1", undefined, AUTH);

      expect(result).toEqual({ status: OrderStatus.CONFIRMED, payment: { status: "PAID" } });
      expect((prisma as unknown as { orderStatusToken: { findUnique: unknown } }).orderStatusToken.findUnique).not.toHaveBeenCalled();
    });

    it("returns 404 for a caller who is not the order's owner, even with a valid token", async () => {
      const prisma = makePrismaMock({
        order: ORDER_ROW,
        tokenRecord: { orderId: "order-1", expiresAt: new Date(Date.now() + 60_000) },
      });
      const service = new OrdersService(prisma);
      const otherUser: AuthContext = { ...AUTH, userId: "user-2" };

      await expect(service.getStatus("order-1", RAW_TOKEN, otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 404 for a guest order (userId null) requested by any authenticated caller", async () => {
      const prisma = makePrismaMock({ order: GUEST_ORDER_ROW });
      const service = new OrdersService(prisma);

      await expect(service.getStatus("order-1", undefined, AUTH)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("guest caller — token-only authorization", () => {
    it("returns 404 when no token header is provided at all", async () => {
      const prisma = makePrismaMock({ order: GUEST_ORDER_ROW });
      const service = new OrdersService(prisma);

      await expect(service.getStatus("order-1", undefined, undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns status for a guest with a valid, unexpired, matching token", async () => {
      const prisma = makePrismaMock({
        order: GUEST_ORDER_ROW,
        tokenRecord: { orderId: "order-1", expiresAt: new Date(Date.now() + 60_000) },
      });
      const service = new OrdersService(prisma);

      const result = await service.getStatus("order-1", RAW_TOKEN, undefined);

      expect(result).toEqual({
        status: OrderStatus.PENDING_PAYMENT,
        payment: { status: "PENDING" },
      });
      expect(
        (prisma as unknown as { orderStatusToken: { findUnique: ReturnType<typeof vi.fn> } })
          .orderStatusToken.findUnique,
      ).toHaveBeenCalledWith({
        where: { tokenHash: TOKEN_HASH },
        select: { orderId: true, expiresAt: true },
      });
    });

    it("returns 404 for a token that hashes to nothing on record", async () => {
      const prisma = makePrismaMock({ order: GUEST_ORDER_ROW, tokenRecord: null });
      const service = new OrdersService(prisma);

      await expect(service.getStatus("order-1", "wrong-token", undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 404 for a token scoped to a different order", async () => {
      const prisma = makePrismaMock({
        order: GUEST_ORDER_ROW,
        tokenRecord: { orderId: "order-OTHER", expiresAt: new Date(Date.now() + 60_000) },
      });
      const service = new OrdersService(prisma);

      await expect(service.getStatus("order-1", RAW_TOKEN, undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 404 for an expired token", async () => {
      const prisma = makePrismaMock({
        order: GUEST_ORDER_ROW,
        tokenRecord: { orderId: "order-1", expiresAt: new Date(Date.now() - 1000) },
      });
      const service = new OrdersService(prisma);

      await expect(service.getStatus("order-1", RAW_TOKEN, undefined)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it("returns only { status, payment: { status } } — no other keys", async () => {
    const prisma = makePrismaMock({ order: ORDER_ROW });
    const service = new OrdersService(prisma);

    const result = await service.getStatus("order-1", undefined, AUTH);

    expect(Object.keys(result).sort()).toEqual(["payment", "status"]);
    expect(Object.keys(result.payment)).toEqual(["status"]);
  });
});
