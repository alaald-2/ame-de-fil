// Integration test (TESTING.md §3 — Vitest + Testcontainers, real
// Postgres). Exercises CheckoutService.initiate() end-to-end against a real
// database with no mocked Prisma calls — the exact layer where the
// lineTaxMinor defect (an intermediate pricing field with no matching
// OrderItem column, spread straight into tx.orderItem.create()) was
// invisible under checkout.service.spec.ts's mocked tx.orderItem.create,
// which accepts any key. This test would have failed with
// PrismaClientValidationError before that fix.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { OrderStatus, PaymentStatus } from "@ame-de-fil/database";
import { CheckoutService } from "./checkout.service.ts";
import { ManualShippingProvider } from "../shipping/shipping-provider.ts";
import { PendingPaymentProvider } from "../payments/payment-provider.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import {
  seedShopFixture,
  seedVariant,
  type ShopFixture,
  type VariantFixture,
} from "../test/fixtures.ts";
import type { InitiateCheckoutInput } from "./dto/initiate-checkout.dto.ts";

function fakeConfig(): ConstructorParameters<typeof CheckoutService>[3] {
  const values: Record<string, unknown> = {
    CHECKOUT_RESERVATION_TTL_MINUTES: 15,
    CHECKOUT_IDEMPOTENCY_TTL_HOURS: 24,
    ORDER_STATUS_TOKEN_TTL_HOURS: 2,
  };
  return { get: (key: string) => values[key] } as never;
}

describe("CheckoutService.initiate — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let variant: VariantFixture;
  let checkout: CheckoutService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  beforeEach(async () => {
    variant = await seedVariant(db.prisma, shop.taxClassId);
    checkout = new CheckoutService(
      db.prisma,
      new ManualShippingProvider(db.prisma),
      new PendingPaymentProvider(),
      fakeConfig(),
    );
  });

  it("creates a real Order/OrderItem/Payment/StockReservation without a schema mismatch (regression: lineTaxMinor)", async () => {
    const guestToken = randomUUID();
    const cart = await db.prisma.cart.create({ data: { guestToken } });
    await db.prisma.cartItem.create({
      data: { cartId: cart.id, productVariantId: variant.variantId, quantity: 2 },
    });

    const input: InitiateCheckoutInput = {
      locale: "sv-SE",
      shippingMethodId: shop.shippingMethodId,
      guestEmail: "checkout-integration@example.com",
      shippingAddress: {
        name: "Test Testsson",
        line1: "Testgatan 1",
        postalCode: "11122",
        city: "Stockholm",
        country: "SE",
      },
    };

    const response = await checkout.initiate({ guestToken }, undefined, `key-${guestToken}`, input);

    expect(response.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(response.items).toHaveLength(1);
    expect(response.total.amountMinor).toBe(variant.unitPriceMinor * 2 + shop.shippingPriceMinor);

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: response.orderId } });
    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);

    const payment = await db.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe(PaymentStatus.PENDING);

    const reservation = await db.prisma.stockReservation.findFirstOrThrow({
      where: { orderItem: { orderId: order.id } },
    });
    expect(reservation.quantity).toBe(2);

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { productVariantId: variant.variantId },
    });
    expect(inventory.reserved).toBe(2);

    // Cart is spent.
    const remainingItems = await db.prisma.cartItem.count({ where: { cartId: cart.id } });
    expect(remainingItems).toBe(0);
  });
});
