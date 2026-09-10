import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { InventoryService } from "../inventory/inventory.service.ts";

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const orderAggregate = vi.fn().mockResolvedValue({ _sum: { totalMinor: null }, _count: 0 });
  const orderGroupBy = vi.fn().mockResolvedValue([]);
  const orderCount = vi.fn().mockResolvedValue(0);
  const paymentGroupBy = vi.fn().mockResolvedValue([]);
  const paymentCount = vi.fn().mockResolvedValue(0);
  const refundAggregate = vi.fn().mockResolvedValue({ _sum: { amountMinor: null } });
  const refundGroupBy = vi.fn().mockResolvedValue([]);
  const refundCount = vi.fn().mockResolvedValue(0);
  const userCount = vi.fn().mockResolvedValue(0);

  const prisma: Record<string, unknown> = {
    order: { aggregate: orderAggregate, groupBy: orderGroupBy, count: orderCount },
    payment: { groupBy: paymentGroupBy, count: paymentCount },
    refund: { aggregate: refundAggregate, groupBy: refundGroupBy, count: refundCount },
    user: { count: userCount },
    ...overrides,
  };

  return {
    prisma: prisma as unknown as PrismaService,
    orderAggregate,
    orderGroupBy,
    orderCount,
    paymentGroupBy,
    paymentCount,
    refundAggregate,
    refundGroupBy,
    refundCount,
    userCount,
  };
}

function makeInventoryMock(lowStockCount = 0) {
  return { countLowStock: vi.fn().mockResolvedValue(lowStockCount) } as unknown as InventoryService & {
    countLowStock: ReturnType<typeof vi.fn>;
  };
}

describe("DashboardService.getOverview", () => {
  it("rejects a range where from is not strictly before to", async () => {
    const { prisma } = makePrismaMock();
    const service = new DashboardService(prisma, makeInventoryMock());

    await expect(
      service.getOverview("2026-01-10T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ).rejects.toThrow(BadRequestException);
  });

  it("defaults to the last 30 days when from/to are both omitted", async () => {
    const { prisma, orderAggregate } = makePrismaMock();
    const service = new DashboardService(prisma, makeInventoryMock());

    const before = Date.now();
    const result = await service.getOverview();
    const after = Date.now();

    const to = new Date(result.period.to).getTime();
    const from = new Date(result.period.from).getTime();
    expect(to).toBeGreaterThanOrEqual(before);
    expect(to).toBeLessThanOrEqual(after);
    expect(to - from).toBe(30 * 24 * 60 * 60 * 1000);

    const revenueWhere = orderAggregate.mock.calls[0]?.[0]?.where?.confirmedAt;
    expect(revenueWhere.gte.getTime()).toBe(from);
    expect(revenueWhere.lt.getTime()).toBe(to);
  });

  it("coalesces null sums to zero and reports averageOrderValueMinor as null with zero confirmed orders", async () => {
    const { prisma } = makePrismaMock();
    const service = new DashboardService(prisma, makeInventoryMock());

    const result = await service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");

    expect(result.revenue.grossMinor).toBe(0);
    expect(result.revenue.refundsMinor).toBe(0);
    expect(result.revenue.netMinor).toBe(0);
    expect(result.revenue.averageOrderValueMinor).toBeNull();
  });

  it("computes gross, refunds, net, and a rounded average order value", async () => {
    const { prisma, orderAggregate, refundAggregate } = makePrismaMock();
    orderAggregate.mockResolvedValue({ _sum: { totalMinor: 100_000 }, _count: 3 });
    refundAggregate.mockResolvedValue({ _sum: { amountMinor: 10_000 } });
    const service = new DashboardService(prisma, makeInventoryMock());

    const result = await service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");

    expect(result.revenue.grossMinor).toBe(100_000);
    expect(result.revenue.refundsMinor).toBe(10_000);
    expect(result.revenue.netMinor).toBe(90_000);
    expect(result.revenue.confirmedOrderCount).toBe(3);
    expect(result.revenue.averageOrderValueMinor).toBe(Math.round(100_000 / 3));
  });

  it("maps order/payment/refund byStatus breakdowns and totals", async () => {
    const { prisma, orderGroupBy, orderCount, paymentGroupBy, paymentCount, refundGroupBy, refundCount } =
      makePrismaMock();
    orderGroupBy.mockResolvedValue([
      { status: "CONFIRMED", _count: 4 },
      { status: "CANCELED", _count: 1 },
    ]);
    orderCount.mockResolvedValue(5);
    paymentGroupBy.mockResolvedValue([{ status: "PAID", _count: 4 }]);
    paymentCount.mockResolvedValue(4);
    refundGroupBy.mockResolvedValue([{ status: "SUCCEEDED", _count: 2, _sum: { amountMinor: 5000 } }]);
    refundCount.mockResolvedValue(2);
    const service = new DashboardService(prisma, makeInventoryMock());

    const result = await service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");

    expect(result.orders).toEqual({
      totalInPeriod: 5,
      byStatus: [
        { status: "CONFIRMED", count: 4 },
        { status: "CANCELED", count: 1 },
      ],
    });
    expect(result.payments).toEqual({ totalInPeriod: 4, byStatus: [{ status: "PAID", count: 4 }] });
    expect(result.refunds).toEqual({
      totalInPeriod: 2,
      byStatus: [{ status: "SUCCEEDED", count: 2, amountMinor: 5000 }],
    });
  });

  it("never counts a staff user (holding a role) toward customer counts", async () => {
    const { prisma, userCount } = makePrismaMock();
    userCount.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    const service = new DashboardService(prisma, makeInventoryMock());

    const result = await service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");

    expect(result.customers).toEqual({ totalRegistered: 10, newInPeriod: 2 });
    for (const call of userCount.mock.calls) {
      expect(call[0].where.roles).toEqual({ none: {} });
    }
  });

  it("surfaces alert counts unscoped by the requested period, alongside inventory.lowStockCount", async () => {
    const { prisma, paymentCount, refundCount } = makePrismaMock();
    // paymentCount/refundCount are each called twice in getOverview (once
    // period-scoped for totalInPeriod, once unscoped for the alert) —
    // the alert call must carry no createdAt filter at all.
    paymentCount.mockResolvedValueOnce(4).mockResolvedValueOnce(1); // totalInPeriod, then disputed
    refundCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1); // totalInPeriod, then failed
    const service = new DashboardService(prisma, makeInventoryMock(7));

    const result = await service.getOverview("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");

    expect(result.alerts).toEqual({ lowStockCount: 7, disputedPaymentsCount: 1, failedRefundsCount: 1 });
    expect(result.inventory).toEqual({ lowStockCount: 7 });

    const disputedCall = paymentCount.mock.calls[1]?.[0];
    expect(disputedCall.where).toEqual({ status: "DISPUTED" });
    const failedRefundCall = refundCount.mock.calls[1]?.[0];
    expect(failedRefundCall.where).toEqual({ status: "FAILED" });
  });
});
