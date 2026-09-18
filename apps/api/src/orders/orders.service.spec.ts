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

function makePrismaMock(
  overrides: {
    order?: unknown;
    tokenRecord?: unknown;
  } = {},
) {
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

    await expect(service.getStatus("order-1", undefined, AUTH)).rejects.toThrow(NotFoundException);
  });

  describe("authenticated caller — object-level ownership, token never consulted", () => {
    it("returns status for the order's own owner, with no token required", async () => {
      const prisma = makePrismaMock({ order: ORDER_ROW });
      const service = new OrdersService(prisma);

      const result = await service.getStatus("order-1", undefined, AUTH);

      expect(result).toEqual({ status: OrderStatus.CONFIRMED, payment: { status: "PAID" } });
      expect(
        (prisma as unknown as { orderStatusToken: { findUnique: unknown } }).orderStatusToken
          .findUnique,
      ).not.toHaveBeenCalled();
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

const MY_ORDER_LIST_ROW = {
  id: "order-1",
  orderNumber: "1001",
  status: OrderStatus.CONFIRMED,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  totalMinor: 4500,
  currency: "SEK",
  _count: { items: 2 },
};

const MY_ORDER_DETAIL_ROW = {
  userId: "user-1",
  id: "order-1",
  orderNumber: "1001",
  status: OrderStatus.SHIPPED,
  locale: "sv_SE",
  currency: "SEK",
  subtotalMinor: 4000,
  discountMinor: 0,
  shippingMinor: 500,
  taxMinor: 0,
  totalMinor: 4500,
  shippingName: "Ada Lovelace",
  shippingLine1: "Storgatan 1",
  shippingLine2: null,
  shippingPostalCode: "111 22",
  shippingCity: "Stockholm",
  shippingCountry: "SE",
  shippingPhone: null,
  billingName: "Ada Lovelace",
  billingLine1: "Storgatan 1",
  billingLine2: null,
  billingPostalCode: "111 22",
  billingCity: "Stockholm",
  billingCountry: "SE",
  billingPhone: null,
  shippingMethod: { nameSv: "Standardfrakt", nameEn: "Standard shipping" },
  items: [
    {
      id: "item-1",
      productNameSnapshot: "Handgjord halsduk",
      variantLabelSnapshot: "Röd",
      skuSnapshot: null,
      articleNumberSnapshot: 100001,
      unitPriceMinor: 2000,
      quantity: 2,
      lineSubtotalMinor: 4000,
      lineTotalMinor: 4000,
      madeToOrder: false,
      productionTimeDaysSnapshot: null,
    },
  ],
  payments: [
    {
      method: "card",
      status: PaymentStatus.PAID,
      amountMinor: 4500,
      currency: "SEK",
      createdAt: new Date("2026-09-01T00:05:00.000Z"),
      refunds: [],
    },
  ],
  shipments: [
    {
      status: "IN_TRANSIT",
      carrierName: "PostNord",
      trackingNumber: "ABC123",
      trackingUrl: "https://example.com/track/ABC123",
      shippedAt: new Date("2026-09-02T00:00:00.000Z"),
      deliveredAt: null,
    },
  ],
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  confirmedAt: new Date("2026-09-01T00:05:00.000Z"),
  canceledAt: null,
};

function makeListPrismaMock(rows: unknown[], total: number) {
  return {
    order: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaService;
}

function makeDetailPrismaMock(row: unknown) {
  return { order: { findUnique: vi.fn().mockResolvedValue(row) } } as unknown as PrismaService;
}

describe("OrdersService.listMyOrders", () => {
  it("scopes the query to the caller's own userId and paginates", async () => {
    const prisma = makeListPrismaMock([MY_ORDER_LIST_ROW], 1);
    const service = new OrdersService(prisma);

    const result = await service.listMyOrders("user-1", 1, 20);

    expect(result).toEqual({
      items: [
        {
          orderId: "order-1",
          orderNumber: "1001",
          status: OrderStatus.CONFIRMED,
          total: { amountMinor: 4500, currency: "SEK" },
          itemCount: 2,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(
      (prisma as unknown as { order: { findMany: ReturnType<typeof vi.fn> } }).order.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });
});

describe("OrdersService.getMyOrderDetail", () => {
  it("returns 404 when the order does not exist at all", async () => {
    const prisma = makeDetailPrismaMock(null);
    const service = new OrdersService(prisma);

    await expect(service.getMyOrderDetail("user-1", "order-1")).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for an order that exists but belongs to someone else — never confirms it exists", async () => {
    const prisma = makeDetailPrismaMock({ ...MY_ORDER_DETAIL_ROW, userId: "user-2" });
    const service = new OrdersService(prisma);

    await expect(service.getMyOrderDetail("user-1", "order-1")).rejects.toThrow(NotFoundException);
  });

  it("returns full detail for the order's own owner, with no admin-only fields", async () => {
    const prisma = makeDetailPrismaMock(MY_ORDER_DETAIL_ROW);
    const service = new OrdersService(prisma);

    const result = await service.getMyOrderDetail("user-1", "order-1");

    expect(result.orderId).toBe("order-1");
    expect(result.payment).toEqual({
      method: "card",
      status: PaymentStatus.PAID,
      amount: { amountMinor: 4500, currency: "SEK" },
      createdAt: "2026-09-01T00:05:00.000Z",
    });
    expect(result.refunds).toEqual([]);
    expect(result.shipments).toEqual([
      {
        status: "IN_TRANSIT",
        carrierName: "PostNord",
        trackingNumber: "ABC123",
        trackingUrl: "https://example.com/track/ABC123",
        shippedAt: "2026-09-02T00:00:00.000Z",
        deliveredAt: null,
      },
    ]);
    expect(result).not.toHaveProperty("customer");
    expect(result.payment && Object.keys(result.payment)).not.toContain("providerPaymentIntentId");
  });
});
