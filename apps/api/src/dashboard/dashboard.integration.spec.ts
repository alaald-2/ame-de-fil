// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked DashboardService against a real database —
// this checkpoint is entirely aggregation logic (SUM/COUNT/groupBy over
// exact date-column boundaries), exactly the kind of thing a mocked Prisma
// client can't honestly verify (a mock can't prove a WHERE clause's
// half-open interval is actually correct against real row data).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  Currency,
  Locale,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  UserStatus,
} from "@ame-de-fil/database";
import { DashboardService } from "./dashboard.service.ts";
import { InventoryService } from "../inventory/inventory.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import { seedShopFixture, seedVariant, type ShopFixture, type VariantFixture } from "../test/fixtures.ts";

describe("DashboardService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let variant: VariantFixture;
  let service: DashboardService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    variant = await seedVariant(db.prisma, shop.taxClassId);
    service = new DashboardService(db.prisma, new InventoryService(db.prisma, new AuditService(db.prisma)));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedOrder(options: {
    status: OrderStatus;
    totalMinor: number;
    createdAt: Date;
    confirmedAt?: Date;
    userId?: string;
    guestEmail?: string;
  }) {
    return db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        userId: options.userId ?? null,
        guestEmail: options.userId ? null : (options.guestEmail ?? "dashboard-test@example.com"),
        locale: Locale.sv_SE,
        status: options.status,
        currency: Currency.SEK,
        subtotalMinor: options.totalMinor,
        taxMinor: 0,
        totalMinor: options.totalMinor,
        shippingMethodId: shop.shippingMethodId,
        shippingName: "Test Testsson",
        shippingLine1: "Testgatan 1",
        shippingPostalCode: "11122",
        shippingCity: "Stockholm",
        billingName: "Test Testsson",
        billingLine1: "Testgatan 1",
        billingPostalCode: "11122",
        billingCity: "Stockholm",
        createdAt: options.createdAt,
        confirmedAt: options.confirmedAt ?? null,
      },
    });
  }

  async function seedPayment(options: { orderId: string; status: PaymentStatus; amountMinor: number; createdAt: Date }) {
    return db.prisma.payment.create({
      data: {
        orderId: options.orderId,
        provider: "stripe",
        providerPaymentIntentId: `pi_${randomUUID()}`,
        status: options.status,
        amountMinor: options.amountMinor,
        currency: Currency.SEK,
        createdAt: options.createdAt,
      },
    });
  }

  async function seedRefund(options: {
    paymentId: string;
    status: RefundStatus;
    amountMinor: number;
    createdAt: Date;
    processedAt?: Date;
  }) {
    return db.prisma.refund.create({
      data: {
        paymentId: options.paymentId,
        amountMinor: options.amountMinor,
        currency: Currency.SEK,
        status: options.status,
        createdAt: options.createdAt,
        processedAt: options.processedAt ?? null,
      },
    });
  }

  async function seedCustomer(createdAt: Date) {
    return db.prisma.user.create({
      data: { email: `customer-${randomUUID()}@example.com`, status: UserStatus.ACTIVE, createdAt },
    });
  }

  const day = (offset: number) => new Date(Date.UTC(2027, 0, 1 + offset)); // 2027-01-01 + offset days, UTC

  describe("revenue", () => {
    it("excludes an order confirmed before the period, includes one confirmed inside it", async () => {
      const from = day(10);
      const to = day(20);
      await seedOrder({ status: OrderStatus.CONFIRMED, totalMinor: 10_000, createdAt: day(5), confirmedAt: day(5) });
      await seedOrder({ status: OrderStatus.CONFIRMED, totalMinor: 25_000, createdAt: day(12), confirmedAt: day(12) });

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue.grossMinor).toBe(25_000);
      expect(result.revenue.confirmedOrderCount).toBe(1);
      expect(result.revenue.averageOrderValueMinor).toBe(25_000);
    });

    it("respects the half-open interval: confirmedAt === from is included, confirmedAt === to is excluded", async () => {
      const from = day(100);
      const to = day(110);
      await seedOrder({ status: OrderStatus.CONFIRMED, totalMinor: 1_000, createdAt: from, confirmedAt: from });
      await seedOrder({ status: OrderStatus.CONFIRMED, totalMinor: 2_000, createdAt: to, confirmedAt: to });

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue.grossMinor).toBe(1_000);
      expect(result.revenue.confirmedOrderCount).toBe(1);
    });

    it("a CANCELED order (no confirmedAt) contributes zero revenue but appears in orders.byStatus", async () => {
      const from = day(200);
      const to = day(210);
      await seedOrder({ status: OrderStatus.CANCELED, totalMinor: 5_000, createdAt: day(205) });

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue.grossMinor).toBe(0);
      expect(result.orders.byStatus.find((s) => s.status === "CANCELED")?.count).toBeGreaterThanOrEqual(1);
    });

    it("counts PAYMENT_SUCCEEDED_STOCK_LOST as revenue (a real successful payment despite a fulfillment problem)", async () => {
      const from = day(300);
      const to = day(310);
      await seedOrder({
        status: OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST,
        totalMinor: 15_000,
        createdAt: day(302),
        confirmedAt: day(302),
      });

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue.grossMinor).toBe(15_000);
    });

    it("nets a refund processed in this period against gross revenue even when the order was confirmed in an earlier period", async () => {
      const earlierConfirm = day(400);
      const from = day(410);
      const to = day(420);

      const order = await seedOrder({
        status: OrderStatus.PARTIALLY_REFUNDED,
        totalMinor: 20_000,
        createdAt: earlierConfirm,
        confirmedAt: earlierConfirm, // confirmed BEFORE this period — contributes 0 to this period's gross
      });
      const payment = await seedPayment({
        orderId: order.id,
        status: PaymentStatus.PARTIALLY_REFUNDED,
        amountMinor: 20_000,
        createdAt: earlierConfirm,
      });
      await seedRefund({
        paymentId: payment.id,
        status: RefundStatus.SUCCEEDED,
        amountMinor: 7_000,
        createdAt: day(415),
        processedAt: day(415), // processed INSIDE this period
      });

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue.grossMinor).toBe(0); // the order's own confirmation is outside this period
      expect(result.revenue.refundsMinor).toBe(7_000);
      expect(result.revenue.netMinor).toBe(-7_000); // proves net is not floored at zero — a real cash-basis outflow
    });

    it("returns all zeros and a null average for a period with no data at all", async () => {
      const from = day(9000);
      const to = day(9010);

      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.revenue).toEqual({
        grossMinor: 0,
        refundsMinor: 0,
        netMinor: 0,
        currency: "SEK",
        confirmedOrderCount: 0,
        averageOrderValueMinor: null,
      });
      expect(result.orders).toEqual({ totalInPeriod: 0, byStatus: [] });
      expect(result.payments).toEqual({ totalInPeriod: 0, byStatus: [] });
      expect(result.refunds).toEqual({ totalInPeriod: 0, byStatus: [] });
    });
  });

  describe("customers", () => {
    it("counts a guest order toward revenue but never toward customer counts", async () => {
      const from = day(500);
      const to = day(510);
      await seedOrder({
        status: OrderStatus.CONFIRMED,
        totalMinor: 8_000,
        createdAt: day(505),
        confirmedAt: day(505),
        guestEmail: "guest-dashboard@example.com",
      });

      const before = await service.getOverview(from.toISOString(), to.toISOString());
      expect(before.revenue.grossMinor).toBe(8_000);
      expect(before.customers.newInPeriod).toBe(0);
    });

    it("counts a new registered customer within the period, and reflects them in the all-time total", async () => {
      const from = day(600);
      const to = day(610);
      const totalBefore = await service.getOverview(from.toISOString(), to.toISOString());
      await seedCustomer(day(605));

      const after = await service.getOverview(from.toISOString(), to.toISOString());

      expect(after.customers.newInPeriod).toBe(totalBefore.customers.newInPeriod + 1);
      expect(after.customers.totalRegistered).toBe(totalBefore.customers.totalRegistered + 1);
    });
  });

  describe("alerts (current snapshots, unscoped by period)", () => {
    it("counts a DISPUTED payment and a FAILED refund regardless of how old they are relative to the requested period", async () => {
      const longAgo = day(0);
      const order = await seedOrder({ status: OrderStatus.CONFIRMED, totalMinor: 3_000, createdAt: longAgo, confirmedAt: longAgo });
      const disputedPayment = await seedPayment({
        orderId: order.id,
        status: PaymentStatus.DISPUTED,
        amountMinor: 3_000,
        createdAt: longAgo,
      });
      await seedRefund({ paymentId: disputedPayment.id, status: RefundStatus.FAILED, amountMinor: 3_000, createdAt: longAgo });

      // A period far in the future, nowhere near `longAgo` — the alert
      // counts must still reflect the old, still-unresolved records.
      const from = day(700);
      const to = day(710);
      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.alerts.disputedPaymentsCount).toBeGreaterThanOrEqual(1);
      expect(result.alerts.failedRefundsCount).toBeGreaterThanOrEqual(1);
      // And they must NOT appear in the period-scoped payments/refunds breakdowns for this unrelated window.
      expect(result.payments.byStatus.find((s) => s.status === "DISPUTED")).toBeUndefined();
      expect(result.refunds.byStatus.find((s) => s.status === "FAILED")).toBeUndefined();
    });

    it("reflects the current low-stock count via the same predicate InventoryService.listLowStock uses", async () => {
      await db.prisma.inventoryItem.update({
        where: { id: variant.inventoryItemId },
        data: { tracksStock: true, lowStockThreshold: 999_999, onHand: 1, reserved: 0 }, // force "low"
      });

      const from = day(800);
      const to = day(810);
      const result = await service.getOverview(from.toISOString(), to.toISOString());

      expect(result.alerts.lowStockCount).toBeGreaterThanOrEqual(1);
      expect(result.inventory.lowStockCount).toBe(result.alerts.lowStockCount);
    });
  });

  it("rejects from >= to with a 400", async () => {
    await expect(service.getOverview(day(20).toISOString(), day(10).toISOString())).rejects.toThrow();
  });
});
