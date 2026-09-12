import { describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Currency, Locale, OrderStatus, PaymentStatus, RefundStatus, ShipmentStatus } from "@ame-de-fil/database";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { ADMIN_ORDER_DETAIL_SELECT, ADMIN_ORDER_LIST_SELECT } from "./mappers/admin-order.mapper.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { NotificationsService } from "../notifications/notifications.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { PaymentProvider } from "../payments/payment-provider.ts";

const ACTOR_USER_ID = "user-1";

function makeNotificationsMock() {
  return { sendShippingNotification: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService & {
    sendShippingNotification: ReturnType<typeof vi.fn>;
  };
}

// Refund-specific tests (below) construct their own PaymentProvider/Env
// mocks tailored to what they're exercising — this one is only for the
// pre-existing fulfillment tests above, which never call issueRefund and so
// never touch either dependency.
function makeUnusedPaymentProviderMock(): PaymentProvider {
  return {
    createPayment: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    refund: vi.fn(),
  };
}

function makeUnusedConfigMock(): ConfigService<Env, true> {
  return { get: vi.fn() } as unknown as ConfigService<Env, true>;
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
  const orderFindMany = vi.fn().mockResolvedValue([]);
  const orderCount = vi.fn().mockResolvedValue(0);
  const orderFindUnique = vi.fn().mockResolvedValue(null);
  const shipmentCreate = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirst = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentFindFirstOrThrow = vi.fn().mockResolvedValue(SHIPMENT);
  const shipmentUpdate = vi.fn().mockResolvedValue({ ...SHIPMENT, status: ShipmentStatus.DELIVERED });
  const auditLogCreate = vi.fn().mockResolvedValue({});

  const prisma: Record<string, unknown> = {
    order: {
      updateMany: orderUpdateMany,
      findUniqueOrThrow: orderFindUniqueOrThrow,
      findMany: orderFindMany,
      count: orderCount,
      findUnique: orderFindUnique,
    },
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
    orderFindMany,
    orderCount,
    orderFindUnique,
    shipmentCreate,
    shipmentFindFirst,
    shipmentFindFirstOrThrow,
    shipmentUpdate,
    auditLogCreate,
  };
}

function makeDecimal(value: number) {
  return { toNumber: () => value };
}

describe("AdminOrdersService.listOrders", () => {
  it("maps rows to the admin-safe list shape, resolving both a registered and a guest customer", async () => {
    const registeredRow = {
      id: "order-reg-1",
      orderNumber: "ORD-1",
      status: OrderStatus.CONFIRMED,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      totalMinor: 15000,
      currency: Currency.SEK,
      guestEmail: null,
      user: { id: "user-1", email: "anna@example.com", firstName: "Anna", lastName: "Andersson" },
      payments: [{ status: PaymentStatus.PAID }],
    };
    const guestRow = {
      id: "order-guest-1",
      orderNumber: "ORD-2",
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: new Date("2026-09-09T00:00:00.000Z"),
      totalMinor: 5000,
      currency: Currency.SEK,
      guestEmail: "guest@example.com",
      user: null,
      payments: [],
    };
    const { prisma, orderFindMany, orderCount } = makePrismaMock({
      order: { findMany: vi.fn().mockResolvedValue([registeredRow, guestRow]), count: vi.fn().mockResolvedValue(2) },
    });
    // makePrismaMock's override replaces the whole `order` object, so re-read
    // the actual mocks it produced for the assertions below.
    const findMany = (prisma as unknown as { order: { findMany: typeof orderFindMany } }).order.findMany;
    const count = (prisma as unknown as { order: { count: typeof orderCount } }).order.count;
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    const result = await service.listOrders(1, 20);

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      select: ADMIN_ORDER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where: {} });
    expect(result).toEqual({
      items: [
        {
          orderId: "order-reg-1",
          orderNumber: "ORD-1",
          status: OrderStatus.CONFIRMED,
          customer: { userId: "user-1", email: "anna@example.com", name: "Anna Andersson" },
          total: { amountMinor: 15000, currency: "SEK" },
          paymentStatus: "PAID",
          createdAt: "2026-09-10T00:00:00.000Z",
        },
        {
          orderId: "order-guest-1",
          orderNumber: "ORD-2",
          status: OrderStatus.PENDING_PAYMENT,
          customer: { userId: null, email: "guest@example.com", name: null },
          total: { amountMinor: 5000, currency: "SEK" },
          paymentStatus: null,
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it("computes skip from page/pageSize for the second page", async () => {
    const { prisma } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.listOrders(3, 10);

    expect(
      (prisma as unknown as { order: { findMany: ReturnType<typeof vi.fn> } }).order.findMany,
    ).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("filters by paymentStatus via a payments.some clause, when provided", async () => {
    const { prisma, orderFindMany, orderCount } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.listOrders(1, 20, PaymentStatus.DISPUTED);

    const expectedWhere = { payments: { some: { status: PaymentStatus.DISPUTED } } };
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(orderCount).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("filters by refundStatus via a nested payments.refunds.some clause, when provided", async () => {
    const { prisma, orderFindMany, orderCount } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.listOrders(1, 20, undefined, RefundStatus.FAILED);

    const expectedWhere = { payments: { some: { refunds: { some: { status: RefundStatus.FAILED } } } } };
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(orderCount).toHaveBeenCalledWith({ where: expectedWhere });
  });

  // Admin search (task: "add a proper search function to every important
  // list/table page") — Orders must be searchable by order number,
  // customer name/email/phone (registered or guest), and line-item SKU/
  // Article Number, all case-insensitive and by partial match.
  describe("search (q)", () => {
    function makeSearchPrismaMock(queryRawResult: { orderId: string }[] = []) {
      return makePrismaMock({ $queryRaw: vi.fn().mockResolvedValue(queryRawResult) });
    }

    it("searches by order number", async () => {
      const { prisma, orderFindMany, orderCount } = makeSearchPrismaMock();
      const service = new AdminOrdersService(
        prisma,
        makeNotificationsMock(),
        new AuditService(prisma),
        makeUnusedPaymentProviderMock(),
        makeUnusedConfigMock(),
      );

      await service.listOrders(1, 20, undefined, undefined, "AF-20260910-M55CL5Q7");

      const whereArg = orderFindMany.mock.calls[0]![0].where;
      expect(whereArg.OR).toContainEqual({
        orderNumber: { contains: "AF-20260910-M55CL5Q7", mode: "insensitive" },
      });
      expect(orderCount).toHaveBeenCalledWith(expect.objectContaining({ where: whereArg }));
    });

    it("searches by customer name, email, and phone — both guest fields and the registered user's own", async () => {
      const { prisma, orderFindMany } = makeSearchPrismaMock();
      const service = new AdminOrdersService(
        prisma,
        makeNotificationsMock(),
        new AuditService(prisma),
        makeUnusedPaymentProviderMock(),
        makeUnusedConfigMock(),
      );

      await service.listOrders(1, 20, undefined, undefined, "elin");

      const whereArg = orderFindMany.mock.calls[0]![0].where;
      // Guest-order fields, searched directly on Order.
      expect(whereArg.OR).toContainEqual({ guestEmail: { contains: "elin", mode: "insensitive" } });
      expect(whereArg.OR).toContainEqual({ shippingName: { contains: "elin", mode: "insensitive" } });
      expect(whereArg.OR).toContainEqual({ billingName: { contains: "elin", mode: "insensitive" } });
      expect(whereArg.OR).toContainEqual({ shippingPhone: { contains: "elin", mode: "insensitive" } });
      expect(whereArg.OR).toContainEqual({ billingPhone: { contains: "elin", mode: "insensitive" } });
      // Registered-customer fields, searched through the user relation.
      expect(whereArg.OR).toContainEqual({
        user: {
          is: {
            OR: [
              { email: { contains: "elin", mode: "insensitive" } },
              { firstName: { contains: "elin", mode: "insensitive" } },
              { lastName: { contains: "elin", mode: "insensitive" } },
              { phone: { contains: "elin", mode: "insensitive" } },
            ],
          },
        },
      });
    });

    it("searches by line-item SKU/Article Number via a raw lookup, folded in as an id filter", async () => {
      const { prisma, orderFindMany } = makeSearchPrismaMock([{ orderId: "order-1" }]);
      const service = new AdminOrdersService(
        prisma,
        makeNotificationsMock(),
        new AuditService(prisma),
        makeUnusedPaymentProviderMock(),
        makeUnusedConfigMock(),
      );

      await service.listOrders(1, 20, undefined, undefined, "MOSSA-BLA-ONE");

      const whereArg = orderFindMany.mock.calls[0]![0].where;
      expect(whereArg.OR).toContainEqual({ id: { in: ["order-1"] } });
    });
  });
});

describe("AdminOrdersService.getOrderDetail", () => {
  const DETAIL_ROW = {
    id: "order-1",
    orderNumber: "ORD-1",
    status: OrderStatus.CONFIRMED,
    locale: Locale.sv_SE,
    currency: Currency.SEK,
    guestEmail: null,
    user: { id: "user-1", email: "anna@example.com", firstName: "Anna", lastName: "Andersson" },
    subtotalMinor: 10000,
    discountMinor: 0,
    shippingMinor: 4900,
    taxMinor: 2500,
    totalMinor: 17400,
    shippingName: "Anna Andersson",
    shippingLine1: "Storgatan 1",
    shippingLine2: null,
    shippingPostalCode: "11122",
    shippingCity: "Stockholm",
    shippingCountry: "SE",
    shippingPhone: null,
    billingName: "Anna Andersson",
    billingLine1: "Storgatan 1",
    billingLine2: null,
    billingPostalCode: "11122",
    billingCity: "Stockholm",
    billingCountry: "SE",
    billingPhone: null,
    shippingMethod: { nameSv: "Standardfrakt", nameEn: "Standard shipping" },
    items: [
      {
        id: "item-1",
        productNameSnapshot: "Halsduk",
        variantLabelSnapshot: "SKU-1",
        skuSnapshot: "SKU-1",
        unitPriceMinor: 10000,
        quantity: 1,
        taxRatePercent: makeDecimal(25),
        lineSubtotalMinor: 10000,
        lineTotalMinor: 10000,
        madeToOrder: false,
        productionTimeDaysSnapshot: null,
      },
    ],
    payments: [
      {
        id: "pay-1",
        provider: "stripe",
        providerPaymentIntentId: "pi_123",
        method: "card",
        status: PaymentStatus.PAID,
        amountMinor: 17400,
        currency: Currency.SEK,
        createdAt: new Date("2026-09-10T00:00:00.000Z"),
        refunds: [],
      },
    ],
    shipments: [],
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    confirmedAt: new Date("2026-09-10T00:05:00.000Z"),
    canceledAt: null,
  };

  it("returns 404 when the order does not exist", async () => {
    const { prisma } = makePrismaMock({ order: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await expect(service.getOrderDetail("missing")).rejects.toThrow(NotFoundException);
  });

  it("queries with the exact admin-safe select (never a bare User include)", async () => {
    const { prisma } = makePrismaMock({ order: { findUnique: vi.fn().mockResolvedValue(DETAIL_ROW) } });
    const findUnique = (prisma as unknown as { order: { findUnique: ReturnType<typeof vi.fn> } }).order
      .findUnique;
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.getOrderDetail("order-1");

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "order-1" },
      select: ADMIN_ORDER_DETAIL_SELECT,
    });
  });

  it("maps a full order to the admin-safe detail shape for a registered customer", async () => {
    const { prisma } = makePrismaMock({ order: { findUnique: vi.fn().mockResolvedValue(DETAIL_ROW) } });
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    const result = await service.getOrderDetail("order-1");

    expect(result.customer).toEqual({ userId: "user-1", email: "anna@example.com", name: "Anna Andersson" });
    expect(result.items).toEqual([
      {
        id: "item-1",
        productName: "Halsduk",
        variantLabel: "SKU-1",
        sku: "SKU-1",
        unitPrice: { amountMinor: 10000, currency: "SEK" },
        quantity: 1,
        taxRatePercent: 25,
        lineSubtotal: { amountMinor: 10000, currency: "SEK" },
        lineTotal: { amountMinor: 10000, currency: "SEK" },
        madeToOrder: false,
        productionTimeDaysSnapshot: null,
      },
    ]);
    expect(result.payments).toEqual([
      {
        id: "pay-1",
        provider: "stripe",
        providerPaymentIntentId: "pi_123",
        method: "card",
        status: PaymentStatus.PAID,
        amount: { amountMinor: 17400, currency: "SEK" },
        createdAt: "2026-09-10T00:00:00.000Z",
        refunds: [],
      },
    ]);
    expect(result.shippingAddress).toEqual({
      name: "Anna Andersson",
      line1: "Storgatan 1",
      line2: null,
      postalCode: "11122",
      city: "Stockholm",
      country: "SE",
      phone: null,
    });
    expect(result.shippingMethodName).toBe("Standardfrakt"); // sv_SE order locale
    expect(result.confirmedAt).toBe("2026-09-10T00:05:00.000Z");
    expect(result.canceledAt).toBeNull();

    // Never leaks anything beyond the four selected User columns.
    expect(result.customer).not.toHaveProperty("passwordHash");
  });

  it("maps a guest order's customer with no userId/name", async () => {
    const guestRow = { ...DETAIL_ROW, guestEmail: "guest@example.com", user: null };
    const { prisma } = makePrismaMock({ order: { findUnique: vi.fn().mockResolvedValue(guestRow) } });
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    const result = await service.getOrderDetail("order-1");

    expect(result.customer).toEqual({ userId: null, email: "guest@example.com", name: null });
  });
});

describe("AdminOrdersService.markReadyToShip", () => {
  it("transitions CONFIRMED -> READY_TO_SHIP", async () => {
    const { prisma, orderUpdateMany, auditLogCreate } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

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
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await expect(service.markReadyToShip("order-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.markShipped", () => {
  const INPUT = { carrierName: "PostNord", trackingNumber: "ABC123" };

  it("transitions READY_TO_SHIP -> SHIPPED and creates a Shipment record", async () => {
    const { prisma, shipmentCreate } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

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
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.markShipped("order-1", {}, ACTOR_USER_ID);

    expect(shipmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ carrierName: null, trackingNumber: null, trackingUrl: null }),
    });
  });

  it("sends the shipping notification only after the transaction has committed (DECISIONS.md ADR-031)", async () => {
    const { prisma } = makePrismaMock();
    const notifications = makeNotificationsMock();
    const service = new AdminOrdersService(
      prisma,
      notifications,
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

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
    const service = new AdminOrdersService(
      prisma,
      notifications,
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await expect(service.markShipped("order-1", INPUT, ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(shipmentCreate).not.toHaveBeenCalled();
    expect(notifications.sendShippingNotification).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.markDelivered", () => {
  it("transitions SHIPPED -> DELIVERED and updates the most recent Shipment", async () => {
    const { prisma, shipmentFindFirstOrThrow, shipmentUpdate } = makePrismaMock();
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

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
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await expect(service.markDelivered("order-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
    expect(shipmentFindFirstOrThrow).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.exportOrdersCsv", () => {
  const FROM = new Date("2026-09-01T00:00:00.000Z");
  const TO = new Date("2026-10-01T00:00:00.000Z");

  it("filters on confirmedAt within the given range", async () => {
    const orderFindMany = vi.fn().mockResolvedValue([]);
    const prisma = { order: { findMany: orderFindMany } } as unknown as PrismaService;
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    await service.exportOrdersCsv(FROM, TO);

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { confirmedAt: { gte: FROM, lt: TO } } }),
    );
  });

  it("one row per order: takes the PAID payment's method/reference, sums only SUCCEEDED refunds", async () => {
    const row = {
      orderNumber: "AF-1",
      confirmedAt: new Date("2026-09-15T12:00:00.000Z"),
      shippingName: "Anna Andersson",
      guestEmail: null,
      status: OrderStatus.DELIVERED,
      subtotalMinor: 10000,
      taxMinor: 2500,
      shippingMinor: 4900,
      discountMinor: 0,
      totalMinor: 17400,
      user: { email: "anna@example.com" },
      payments: [
        {
          status: PaymentStatus.FAILED,
          method: "card",
          providerPaymentIntentId: "pi_failed",
          createdAt: new Date("2026-09-15T11:00:00.000Z"),
          refunds: [],
        },
        {
          status: PaymentStatus.PAID,
          method: "card",
          providerPaymentIntentId: "pi_paid",
          createdAt: new Date("2026-09-15T12:00:00.000Z"),
          refunds: [
            { amountMinor: 1000, status: RefundStatus.SUCCEEDED },
            { amountMinor: 500, status: RefundStatus.FAILED },
          ],
        },
      ],
    };
    const orderFindMany = vi.fn().mockResolvedValue([row]);
    const prisma = { order: { findMany: orderFindMany } } as unknown as PrismaService;
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    const csv = await service.exportOrdersCsv(FROM, TO);
    const BOM = String.fromCharCode(0xfeff);
    const withoutBom = csv.startsWith(BOM) ? csv.slice(1) : csv;
    const lines = withoutBom.split("\r\n");

    expect(lines[0]).toBe(
      "Order number,Date,Customer name,Customer email,Status,Payment method,Payment reference,Subtotal,VAT,Shipping,Discount,Total,Refunded,Net",
    );
    // Refunded: only the SUCCEEDED refund (10.00), never the FAILED one;
    // Net = Total (174.00) - Refunded (10.00).
    expect(lines[1]).toBe(
      "AF-1,2026-09-15T12:00:00.000Z,Anna Andersson,anna@example.com,DELIVERED,card,pi_paid,100.00,25.00,49.00,0.00,174.00,10.00,164.00",
    );
  });

  it("falls back to guestEmail when there is no registered user", async () => {
    const row = {
      orderNumber: "AF-2",
      confirmedAt: new Date("2026-09-15T12:00:00.000Z"),
      shippingName: "Guest Buyer",
      guestEmail: "guest@example.com",
      status: OrderStatus.CONFIRMED,
      subtotalMinor: 5000,
      taxMinor: 1250,
      shippingMinor: 0,
      discountMinor: 0,
      totalMinor: 6250,
      user: null,
      payments: [],
    };
    const orderFindMany = vi.fn().mockResolvedValue([row]);
    const prisma = { order: { findMany: orderFindMany } } as unknown as PrismaService;
    const service = new AdminOrdersService(
      prisma,
      makeNotificationsMock(),
      new AuditService(prisma),
      makeUnusedPaymentProviderMock(),
      makeUnusedConfigMock(),
    );

    const csv = await service.exportOrdersCsv(FROM, TO);

    expect(csv).toContain("guest@example.com");
  });
});
