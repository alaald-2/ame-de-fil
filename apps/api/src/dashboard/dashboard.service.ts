import { BadRequestException, Injectable } from "@nestjs/common";
import { Currency, PaymentStatus, RefundStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { InventoryService } from "../inventory/inventory.service.ts";
import type { DashboardOverviewResponse } from "./dto/dashboard-response.ts";

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // approved default: last 30 days

const INVALID_RANGE = () =>
  new BadRequestException({
    error: "InvalidDateRange",
    message: `"from" must be strictly before "to"`,
  });

// Admin dashboard overview — cross-domain aggregates only, gated by its own
// `dashboard.view` permission (DashboardController). Every figure below is
// computed via database-side aggregation (aggregate/groupBy/count) — never
// a findMany reduced in application code.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // `from`/`to` are raw ISO strings straight from the (already Zod-
  // validated) query — parsing and defaulting happen here, not in the
  // controller, so the exact period-resolution rule lives in one place.
  // Approved default when both are omitted: to = now, from = to - 30d. The
  // same "to defaults to now, from defaults to (resolved to) - 30d" rule
  // is applied when only one of the two is supplied — not explicitly
  // spelled out in the approved scope beyond the both-omitted case, but
  // the natural generalization of it (flagged in the implementation report).
  async getOverview(fromInput?: string, toInput?: string): Promise<DashboardOverviewResponse> {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput ? new Date(fromInput) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
    if (from.getTime() >= to.getTime()) throw INVALID_RANGE();

    const periodWhere = { gte: from, lt: to };

    const [
      revenueAgg,
      refundsAgg,
      ordersByStatus,
      ordersTotalInPeriod,
      paymentsByStatus,
      paymentsTotalInPeriod,
      refundsByStatus,
      refundsTotalInPeriod,
      totalRegisteredCustomers,
      newCustomersInPeriod,
      lowStockCount,
      disputedPaymentsCount,
      failedRefundsCount,
    ] = await Promise.all([
      // Gross revenue: confirmedAt (not createdAt/status) is the gate — it
      // is set exactly once, when the order actually reaches CONFIRMED via
      // a verified payment webhook, and is never set for DRAFT/
      // PENDING_PAYMENT/CANCELED orders. This correctly includes every
      // later state (IN_PRODUCTION...COMPLETED, REFUNDED/PARTIALLY_
      // REFUNDED) and PAYMENT_SUCCEEDED_STOCK_LOST (a real successful
      // payment despite a fulfillment problem, ADR-026) without needing a
      // maintained status allow-list.
      this.prisma.order.aggregate({
        where: { currency: Currency.SEK, confirmedAt: periodWhere },
        _sum: { totalMinor: true },
        _count: true,
      }),
      // Refunds netted against revenue: processedAt (set only on a
      // SUCCEEDED refund, admin-orders.service.ts's issueRefund flow), not
      // createdAt — cash-basis by design. A refund processed in this
      // period reduces *this* period's net figure even if its order was
      // confirmed in an earlier one; it never revises an earlier period.
      this.prisma.refund.aggregate({
        where: { currency: Currency.SEK, status: RefundStatus.SUCCEEDED, processedAt: periodWhere },
        _sum: { amountMinor: true },
      }),
      // Order/payment/refund "byStatus" breakdowns all use createdAt (when
      // the record was made), grouped by *current* status — "what happened
      // to the orders/payments/refunds created this period," not "which
      // records reached each status during this period."
      this.prisma.order.groupBy({
        by: ["status"],
        where: { createdAt: periodWhere },
        _count: true,
      }),
      this.prisma.order.count({ where: { createdAt: periodWhere } }),
      this.prisma.payment.groupBy({
        by: ["status"],
        where: { createdAt: periodWhere },
        _count: true,
      }),
      this.prisma.payment.count({ where: { createdAt: periodWhere } }),
      this.prisma.refund.groupBy({
        by: ["status"],
        where: { createdAt: periodWhere },
        _count: true,
        _sum: { amountMinor: true },
      }),
      this.prisma.refund.count({ where: { createdAt: periodWhere } }),
      // "Customer" = a User holding zero roles (the RBAC checkpoint's own
      // staff filter, inverted) — never counts a guest checkout (no User
      // row exists for one at all), and totalRegistered is all-time
      // (every registered account regardless of ACTIVE/DISABLED status),
      // not period-scoped.
      this.prisma.user.count({ where: { roles: { none: {} } } }),
      this.prisma.user.count({ where: { roles: { none: {} }, createdAt: periodWhere } }),
      // Current-state snapshots below — deliberately NOT period-scoped.
      // Stock level "right now" is what's operationally relevant, not "as
      // of `to`"; a chargeback can be filed weeks after the original
      // payment, and a failed refund needing a retry doesn't become less
      // urgent with age, so gating either by createdAt-in-period would
      // hide an old-but-still-urgent one.
      this.inventory.countLowStock(),
      this.prisma.payment.count({ where: { status: PaymentStatus.DISPUTED } }),
      this.prisma.refund.count({ where: { status: RefundStatus.FAILED } }),
    ]);

    const grossMinor = revenueAgg._sum.totalMinor ?? 0;
    const confirmedOrderCount = revenueAgg._count;
    const refundsMinor = refundsAgg._sum.amountMinor ?? 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      revenue: {
        grossMinor,
        refundsMinor,
        netMinor: grossMinor - refundsMinor,
        currency: Currency.SEK,
        confirmedOrderCount,
        averageOrderValueMinor:
          confirmedOrderCount > 0 ? Math.round(grossMinor / confirmedOrderCount) : null,
      },
      orders: {
        totalInPeriod: ordersTotalInPeriod,
        byStatus: ordersByStatus.map((row) => ({ status: row.status, count: row._count })),
      },
      payments: {
        totalInPeriod: paymentsTotalInPeriod,
        byStatus: paymentsByStatus.map((row) => ({ status: row.status, count: row._count })),
      },
      refunds: {
        totalInPeriod: refundsTotalInPeriod,
        byStatus: refundsByStatus.map((row) => ({
          status: row.status,
          count: row._count,
          amountMinor: row._sum.amountMinor ?? 0,
        })),
      },
      customers: {
        totalRegistered: totalRegisteredCustomers,
        newInPeriod: newCustomersInPeriod,
      },
      inventory: { lowStockCount },
      alerts: { lowStockCount, disputedPaymentsCount, failedRefundsCount },
    };
  }
}
