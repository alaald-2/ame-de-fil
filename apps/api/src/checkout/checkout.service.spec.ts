import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  Locale,
  OrderStatus,
  ProductStatus,
  StockReservationStatus,
  Prisma,
} from "@ame-de-fil/database";
import { CheckoutService } from "./checkout.service.ts";
import { hashOrderStatusToken } from "../common/order-status-token.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { ShippingProvider, ShippingQuote } from "../shipping/shipping-provider.ts";
import type { PaymentProvider, PaymentRecord } from "../payments/payment-provider.ts";
import type { InitiateCheckoutInput } from "./dto/initiate-checkout.dto.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

function decimal(value: number) {
  return { toNumber: () => value };
}

// The real OrderItem scalar columns (schema.prisma) — kept in sync by hand
// deliberately, not derived from the Prisma client, so this test fails
// loudly on drift rather than silently importing whatever the schema
// currently says. Used by the orderItem.create mock below to reject any
// key Prisma itself would reject with PrismaClientValidationError (e.g.
// lineTaxMinor — an intermediate pricing value from priceLine()/
// buildOrderItemSnapshot() that has no matching column and was previously
// spread straight into this call, breaking every real checkout).
const ORDER_ITEM_SCALAR_COLUMNS = new Set([
  "id",
  "orderId",
  "productVariantId",
  "productNameSnapshot",
  "variantLabelSnapshot",
  "skuSnapshot",
  "articleNumberSnapshot",
  "unitPriceMinor",
  "quantity",
  "taxRatePercent",
  "lineSubtotalMinor",
  "lineTotalMinor",
  "madeToOrder",
  "productionTimeDaysSnapshot",
  "basePriceMinor",
  "promotionId",
  "promotionPercentage",
  "createdAt",
]);

const SHIPPING_QUOTE: ShippingQuote = {
  shippingMethodId: "ship-1",
  code: "STANDARD",
  nameSv: "Standardfrakt",
  nameEn: "Standard shipping",
  priceMinor: 4900,
  currency: "SEK",
  minDeliveryDays: 2,
  maxDeliveryDays: 5,
};

const PAYMENT_RECORD: PaymentRecord = {
  id: "pay-1",
  provider: "pending",
  status: "PENDING",
  amountMinor: 0,
  currency: "SEK",
};

const ADDRESS = {
  name: "Anna Andersson",
  line1: "Storgatan 1",
  postalCode: "111 22",
  city: "Stockholm",
  country: "SE" as const,
};

const VALID_INPUT: InitiateCheckoutInput = {
  locale: "sv-SE",
  shippingMethodId: "ship-1",
  guestEmail: "anna@example.com",
  shippingAddress: ADDRESS,
};

const AUTH: AuthContext = { userId: "user-1", sessionId: "s1", csrfToken: "csrf", permissions: [] };

function stockCartItem() {
  return {
    id: "item-1",
    quantity: 2,
    variant: {
      id: "var-1",
      sku: "SKU-1",
      priceMinor: 29900,
      isActive: true,
      taxClassId: "tc-standard",
      product: {
        status: ProductStatus.PUBLISHED,
        translations: [{ locale: Locale.sv_SE, name: "Halsduk" }],
      },
      inventoryItem: { id: "inv-1", tracksStock: true, onHand: 10, reserved: 2 },
      optionValues: [],
    },
  };
}

function madeToOrderCartItem() {
  return {
    id: "item-2",
    quantity: 1,
    variant: {
      id: "var-2",
      sku: "SKU-2",
      priceMinor: 199900,
      isActive: true,
      taxClassId: "tc-standard",
      product: {
        status: ProductStatus.PUBLISHED,
        translations: [{ locale: Locale.sv_SE, name: "Beställningsplagg" }],
      },
      inventoryItem: {
        id: "inv-2",
        tracksStock: false,
        onHand: 0,
        reserved: 0,
        productionTimeDays: 14,
      },
      optionValues: [],
    },
  };
}

interface Fixture {
  cartItems: unknown[];
  lockedRows: Array<{ id: string; onHand: number; reserved: number }>;
  taxRateRows: Array<{ taxClassId: string; ratePercent: { toNumber(): number } }>;
  // Defaults to no active promotions for every existing test in this file
  // — only the dedicated "promotions" describe block below sets this.
  promotionVariantRows?: Array<{
    productVariantId: string;
    promotion: { id: string; name: string; percentage: number; active: boolean; startsAt: Date | null; endsAt: Date | null };
  }>;
  shippingProvider: ShippingProvider;
  paymentProvider: PaymentProvider;
  overrides?: Partial<{
    idempotencyFindUnique: unknown;
    orderCreate: (data: unknown) => unknown;
  }>;
}

function makeService(fixture: Fixture) {
  const txOrderCreate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
    id: "order-1",
    ...args.data,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }));
  const txOrderItemCreate = vi
    .fn()
    .mockImplementation((args: { data: Record<string, unknown> }) => {
      // Mirrors Prisma's own runtime validation: reject any key that isn't
      // a real OrderItem column, instead of permissively accepting
      // whatever the caller spreads in.
      for (const key of Object.keys(args.data)) {
        if (!ORDER_ITEM_SCALAR_COLUMNS.has(key)) {
          throw new Error(`Unknown argument \`${key}\` — not a real OrderItem column`);
        }
      }
      return {
        id: `oi-${txOrderItemCreate.mock.calls.length + 1}`,
        ...args.data,
        taxRatePercent: decimal(args.data["taxRatePercent"] as number),
      };
    });
  const txInventoryItemUpdate = vi.fn().mockResolvedValue({});
  const txStockReservationCreate = vi.fn().mockResolvedValue({});
  const txCartItemDeleteMany = vi.fn().mockResolvedValue({ count: fixture.cartItems.length });
  const txIdempotencyKeyCreate = vi.fn().mockResolvedValue({});
  const txOrderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const txOrderStatusTokenCreate = vi.fn().mockResolvedValue({});

  const tx = {
    cart: {
      findUnique: vi.fn().mockResolvedValue({ id: "cart-1", items: fixture.cartItems }),
    },
    taxRate: { findMany: vi.fn().mockResolvedValue(fixture.taxRateRows) },
    taxClass: { findUnique: vi.fn().mockResolvedValue({ id: "tc-standard", code: "STANDARD" }) },
    promotionVariant: { findMany: vi.fn().mockResolvedValue(fixture.promotionVariantRows ?? []) },
    $queryRaw: vi.fn().mockResolvedValue(fixture.lockedRows),
    order: { create: txOrderCreate, updateMany: txOrderUpdateMany },
    orderItem: { create: txOrderItemCreate },
    inventoryItem: { update: txInventoryItemUpdate },
    stockReservation: { create: txStockReservationCreate },
    payment: {},
    cartItem: { deleteMany: txCartItemDeleteMany },
    idempotencyKey: { create: txIdempotencyKeyCreate },
    orderStatusToken: { create: txOrderStatusTokenCreate },
  };

  const prisma = {
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(fixture.overrides?.idempotencyFindUnique ?? null),
    },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => {
      if (key === "CHECKOUT_RESERVATION_TTL_MINUTES") return 15;
      if (key === "CHECKOUT_IDEMPOTENCY_TTL_HOURS") return 24;
      if (key === "ORDER_STATUS_TOKEN_TTL_HOURS") return 2;
      return undefined;
    },
  } as never;

  const service = new CheckoutService(
    prisma,
    fixture.shippingProvider,
    fixture.paymentProvider,
    config,
  );

  return {
    service,
    prisma,
    tx,
    txOrderCreate,
    txOrderItemCreate,
    txInventoryItemUpdate,
    txStockReservationCreate,
    txCartItemDeleteMany,
    txIdempotencyKeyCreate,
    txOrderStatusTokenCreate,
  };
}

function makeShippingProvider(quote: ShippingQuote | null = SHIPPING_QUOTE): ShippingProvider {
  return {
    listAvailableMethods: vi.fn(),
    getQuote: vi.fn().mockResolvedValue(quote),
  };
}

function makePaymentProvider(record: PaymentRecord = PAYMENT_RECORD): PaymentProvider {
  return {
    createPayment: vi.fn().mockResolvedValue(record),
    refund: vi.fn(),
    verifyWebhookSignature: vi.fn(),
  };
}

const IDENTITY = { guestToken: "guest-token" };

describe("CheckoutService.initiate — guest email requirement", () => {
  it("rejects guest checkout with no guestEmail", async () => {
    const { service } = makeService({
      cartItems: [],
      lockedRows: [],
      taxRateRows: [],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await expect(
      service.initiate(IDENTITY, undefined, "key-1", { ...VALID_INPUT, guestEmail: undefined }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("CheckoutService.initiate — successful checkout", () => {
  it("creates an order with reservations for finite-stock items and none for made-to-order, then clears the cart", async () => {
    const fixture = makeService({
      cartItems: [stockCartItem(), madeToOrderCartItem()],
      lockedRows: [{ id: "inv-1", onHand: 10, reserved: 2 }],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    // Only the finite-stock item gets a reservation + reserved increment.
    expect(fixture.txInventoryItemUpdate).toHaveBeenCalledTimes(1);
    expect(fixture.txInventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { reserved: { increment: 2 } },
    });
    expect(fixture.txStockReservationCreate).toHaveBeenCalledTimes(1);
    expect(fixture.txStockReservationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inventoryItemId: "inv-1", quantity: 2, status: "PENDING" }),
      }),
    );

    expect(fixture.txOrderItemCreate).toHaveBeenCalledTimes(2);
    // Regression for DECISIONS.md ADR-030: the made-to-order line's
    // OrderItem snapshots madeToOrder/productionTimeDaysSnapshot from its
    // InventoryItem; the finite-stock line does not.
    expect(fixture.txOrderItemCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ madeToOrder: false, productionTimeDaysSnapshot: null }),
      }),
    );
    expect(fixture.txOrderItemCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ madeToOrder: true, productionTimeDaysSnapshot: 14 }),
      }),
    );
    expect(fixture.txCartItemDeleteMany).toHaveBeenCalledWith({ where: { cartId: "cart-1" } });
    expect(fixture.txIdempotencyKeyCreate).toHaveBeenCalledTimes(1);

    expect(result.orderId).toBe("order-1");
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(result.reservationExpiresAt).not.toBeNull();
    // subtotal = 29900*2 + 199900*1 = 259700; total = subtotal + shipping (4900)
    expect(result.subtotal.amountMinor).toBe(259700);
    expect(result.total.amountMinor).toBe(264600);
  });

  // Regression test for the lineTaxMinor defect: buildOrderItemSnapshot()
  // returns lineTaxMinor (needed by computeOrderTotals for Order.taxMinor)
  // but OrderItem has no such column — spreading the whole snapshot into
  // orderItem.create() throws PrismaClientValidationError against a real
  // database, even though a permissive mock would accept it silently. The
  // orderItem.create mock above enforces the real column set for exactly
  // this reason.
  it("never passes lineTaxMinor (or any other non-column field) to orderItem.create", async () => {
    const fixture = makeService({
      cartItems: [stockCartItem()],
      lockedRows: [{ id: "inv-1", onHand: 10, reserved: 2 }],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(fixture.txOrderItemCreate).toHaveBeenCalledTimes(1);
    const { data } = fixture.txOrderItemCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty("lineTaxMinor");
    expect(Object.keys(data).every((key) => ORDER_ITEM_SCALAR_COLUMNS.has(key))).toBe(true);
  });

  it("issues a fresh order-status token, persisting only its hash and returning only the plaintext", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(typeof result.orderStatusToken).toBe("string");
    expect(result.orderStatusToken.length).toBeGreaterThan(0);
    expect(fixture.txOrderStatusTokenCreate).toHaveBeenCalledTimes(1);

    const createCall = fixture.txOrderStatusTokenCreate.mock.calls[0]![0] as {
      data: { orderId: string; tokenHash: string; expiresAt: Date };
    };
    expect(createCall.data.orderId).toBe("order-1");
    // The persisted row never contains the plaintext token — only its hash.
    expect(createCall.data.tokenHash).toBe(hashOrderStatusToken(result.orderStatusToken));
    expect(createCall.data.tokenHash).not.toBe(result.orderStatusToken);
  });

  it("sets reservationExpiresAt to null for an all-made-to-order cart", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(fixture.txInventoryItemUpdate).not.toHaveBeenCalled();
    expect(fixture.txStockReservationCreate).not.toHaveBeenCalled();
    expect(result.reservationExpiresAt).toBeNull();
  });

  it("uses the authenticated user's identity and omits guestEmail on the order", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await fixture.service.initiate({ userId: "user-1" }, AUTH, "key-1", {
      ...VALID_INPUT,
      guestEmail: undefined,
    });

    expect(fixture.txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", guestEmail: null }),
      }),
    );
  });
});

// Promotion domain integration — checkout is the one place a promotion's
// effective price actually becomes real money (Order/OrderItem totals,
// then the payment provider's amountMinor). The client never supplies a
// price at all (AddItemInput is variantId+quantity only), so there is
// nothing to "reject" from the client here — the point of these tests is
// that the server computes the discounted price on its own from the
// variant + active promotion, with no other code path able to influence it.
describe("CheckoutService.initiate — promotions", () => {
  function activePromotionRow(overrides: Partial<{ startsAt: Date | null; endsAt: Date | null; active: boolean }> = {}) {
    return {
      productVariantId: "var-1",
      promotion: {
        id: "promo-1",
        name: "Autumn Sale",
        percentage: 20,
        active: true,
        startsAt: null,
        endsAt: null,
        ...overrides,
      },
    };
  }

  it("charges the promotion's effective price, snapshots it on the OrderItem, and pays the payment provider that same amount", async () => {
    const paymentProvider = makePaymentProvider();
    const fixture = makeService({
      cartItems: [stockCartItem()],
      lockedRows: [{ id: "inv-1", onHand: 10, reserved: 2 }],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      promotionVariantRows: [activePromotionRow()],
      shippingProvider: makeShippingProvider(),
      paymentProvider,
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    // Base price 29900, qty 2, 20% off -> unit 23920, subtotal 47800.
    expect(fixture.txOrderItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPriceMinor: 23920,
          basePriceMinor: 29900,
          promotionId: "promo-1",
          promotionPercentage: 20,
          lineSubtotalMinor: 47840,
        }),
      }),
    );
    expect(result.subtotal.amountMinor).toBe(47840);
    expect(result.total.amountMinor).toBe(52740); // + 4900 shipping
    expect(paymentProvider.createPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountMinor: 52740 }),
    );
  });

  it("ignores a promotion scheduled in the future and charges the base price", async () => {
    const fixture = makeService({
      cartItems: [stockCartItem()],
      lockedRows: [{ id: "inv-1", onHand: 10, reserved: 2 }],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      promotionVariantRows: [activePromotionRow({ startsAt: new Date("2099-01-01") })],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(fixture.txOrderItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitPriceMinor: 29900, promotionId: null, promotionPercentage: null }),
      }),
    );
  });

  it("ignores an already-expired promotion and charges the base price", async () => {
    const fixture = makeService({
      cartItems: [stockCartItem()],
      lockedRows: [{ id: "inv-1", onHand: 10, reserved: 2 }],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      promotionVariantRows: [activePromotionRow({ endsAt: new Date("2020-01-01") })],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(fixture.txOrderItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitPriceMinor: 29900, promotionId: null, promotionPercentage: null }),
      }),
    );
  });
});

describe("CheckoutService.initiate — validation failures", () => {
  it("rejects an empty cart", async () => {
    const fixture = makeService({
      cartItems: [],
      lockedRows: [],
      taxRateRows: [],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await expect(
      fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a cart item whose product is no longer published", async () => {
    const item = stockCartItem();
    (item.variant.product as { status: string }).status = ProductStatus.DRAFT;
    const fixture = makeService({
      cartItems: [item],
      lockedRows: [],
      taxRateRows: [],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await expect(
      fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an invalid or deactivated shipping method", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(null),
      paymentProvider: makePaymentProvider(),
    });

    await expect(
      fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects checkout when the locked row shows insufficient stock", async () => {
    const fixture = makeService({
      cartItems: [stockCartItem()], // wants quantity 2
      lockedRows: [{ id: "inv-1", onHand: 3, reserved: 2 }], // only 1 available
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    await expect(
      fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT),
    ).rejects.toThrow(BadRequestException);
    expect(fixture.txOrderCreate).not.toHaveBeenCalled();
  });
});

describe("CheckoutService.initiate — idempotency", () => {
  it("replays the cached response for a repeat of the same request under the same key", async () => {
    const cachedResponse = { orderId: "order-cached" };
    const fixture = makeService({
      cartItems: [],
      lockedRows: [],
      taxRateRows: [],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
      overrides: {
        idempotencyFindUnique: {
          key: "key-1",
          requestHash: null, // set below via computed hash — see next test for the real check
          responseSnapshot: cachedResponse,
          expiresAt: new Date(Date.now() + 60_000),
        },
      },
    });

    // Compute the same hash the service would, so this row is treated as a genuine replay.
    const { hashCheckoutRequest } = await import("./idempotency.ts");
    (fixture.prisma.idempotencyKey.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      key: "key-1",
      requestHash: hashCheckoutRequest(IDENTITY, VALID_INPUT),
      responseSnapshot: cachedResponse,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(result).toEqual(cachedResponse);
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when the same key is reused for a different request", async () => {
    const fixture = makeService({
      cartItems: [],
      lockedRows: [],
      taxRateRows: [],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
      overrides: {
        idempotencyFindUnique: {
          key: "key-1",
          requestHash: "a-completely-different-hash",
          responseSnapshot: {},
          expiresAt: new Date(Date.now() + 60_000),
        },
      },
    });

    await expect(
      fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT),
    ).rejects.toThrow(ConflictException);
  });

  it("proceeds fresh when the cached key has expired", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
      overrides: {
        idempotencyFindUnique: {
          key: "key-1",
          requestHash: "irrelevant-since-expired",
          responseSnapshot: {},
          expiresAt: new Date(Date.now() - 60_000), // already expired
        },
      },
    });
    (fixture.prisma.idempotencyKey as unknown as { delete: unknown }).delete = vi
      .fn()
      .mockResolvedValue({});

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(result.orderId).toBe("order-1");
    expect(fixture.prisma.$transaction).toHaveBeenCalled();
  });

  it("retries with a fresh order number when one collides, then succeeds", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    let calls = 0;
    fixture.txOrderCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
      calls += 1;
      if (calls === 1) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "7.0.0",
          meta: { target: ["orderNumber"] },
        });
      }
      return { id: "order-1", ...args.data, createdAt: new Date("2026-01-01T00:00:00.000Z") };
    });

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(calls).toBe(2);
    expect(result.orderId).toBe("order-1");
  });

  it("replays the winning transaction's response when it loses a concurrent race on the same key", async () => {
    const fixture = makeService({
      cartItems: [madeToOrderCartItem()],
      lockedRows: [],
      taxRateRows: [{ taxClassId: "tc-standard", ratePercent: decimal(25) }],
      shippingProvider: makeShippingProvider(),
      paymentProvider: makePaymentProvider(),
    });

    fixture.txIdempotencyKeyCreate.mockImplementation(() => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.0.0",
        meta: { target: ["key"] },
      });
    });
    const winningResponse = { orderId: "order-from-winner" };
    (fixture.prisma.idempotencyKey.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // pre-check: no row yet
      .mockResolvedValueOnce({ responseSnapshot: winningResponse }); // after losing the race

    const result = await fixture.service.initiate(IDENTITY, undefined, "key-1", VALID_INPUT);

    expect(result).toEqual(winningResponse);
  });
});
