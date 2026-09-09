import { randomUUID } from "node:crypto";
import { Locale, ProductStatus, OrderStatus, Currency, PaymentStatus, StockReservationStatus } from "@ame-de-fil/database";
import type { PrismaService } from "../database/prisma.service.ts";
import { SHIPPING_TAX_CLASS_CODE } from "../checkout/tax-rates.ts";

export interface ShopFixture {
  taxClassId: string;
  shippingMethodId: string;
  shippingPriceMinor: number;
}

// One TaxClass/ShippingMethod per test *file* (call once, from `beforeAll`,
// share across that file's tests) — the tax class code must be the exact
// literal `SHIPPING_TAX_CLASS_CODE` checkout.service.ts's real shipping-VAT
// lookup depends on (a real, hardcoded business constant, not a test
// convenience), so unlike variant fixtures it can't be freely randomized
// per test and must not be created more than once per container (its
// `code` column is `@unique`).
export async function seedShopFixture(prisma: PrismaService): Promise<ShopFixture> {
  const taxClass = await prisma.taxClass.create({
    data: { code: SHIPPING_TAX_CLASS_CODE, name: "Standard 25%" },
  });
  await prisma.taxRate.create({
    data: { taxClassId: taxClass.id, ratePercent: 25, validFrom: new Date("2020-01-01") },
  });

  const shippingMethod = await prisma.shippingMethod.create({
    data: {
      code: "STANDARD",
      nameSv: "Standardfrakt",
      nameEn: "Standard shipping",
      priceMinor: 4900,
      minDeliveryDays: 2,
      maxDeliveryDays: 5,
      isActive: true,
    },
  });

  return {
    taxClassId: taxClass.id,
    shippingMethodId: shippingMethod.id,
    shippingPriceMinor: shippingMethod.priceMinor,
  };
}

export interface VariantFixture {
  variantId: string;
  inventoryItemId: string;
  unitPriceMinor: number;
}

// One published product/variant/inventory row per call — safe to call from
// `beforeEach` (a fresh, independently-tracked `InventoryItem` per test, so
// one test's onHand/reserved changes can never leak into another's
// assertions), unlike `seedShopFixture` above.
export async function seedVariant(
  prisma: PrismaService,
  taxClassId: string,
  options: { tracksStock?: boolean; productionTimeDays?: number | null } = {},
): Promise<VariantFixture> {
  const id = randomUUID();
  const unitPriceMinor = 10000;

  const product = await prisma.product.create({
    data: { status: ProductStatus.PUBLISHED, publishedAt: new Date() },
  });
  await prisma.productTranslation.createMany({
    data: [
      { productId: product.id, locale: Locale.sv_SE, name: "Testprodukt", slug: `testprodukt-${id}` },
      { productId: product.id, locale: Locale.en, name: "Test Product", slug: `test-product-${id}` },
    ],
  });

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `SKU-${id}`, priceMinor: unitPriceMinor, taxClassId, isActive: true },
  });

  const inventoryItem = await prisma.inventoryItem.create({
    data: {
      productVariantId: variant.id,
      onHand: 100,
      reserved: 0,
      tracksStock: options.tracksStock ?? true,
      productionTimeDays: options.productionTimeDays ?? null,
    },
  });

  return { variantId: variant.id, inventoryItemId: inventoryItem.id, unitPriceMinor };
}

export interface PendingOrderFixture {
  orderId: string;
  paymentId: string;
  providerPaymentIntentId: string;
  orderItemId: string;
  // null for a made-to-order line — it never has a StockReservation at
  // all (checkout.service.ts's real behavior, mirrored here).
  stockReservationId: string | null;
  inventoryItemId: string;
}

// Builds an Order/OrderItem/Payment/(StockReservation) directly (bypassing
// CheckoutService.initiate(), which is exercised separately in
// checkout-flow.integration.spec.ts) — these tests are about
// ReservationExpiryService/PaymentsWebhookService, which only ever see
// already-created rows, so constructing the precondition state directly
// keeps each test focused on the one thing it's actually verifying.
export async function seedPendingOrder(
  prisma: PrismaService,
  shop: ShopFixture,
  variant: VariantFixture,
  options: {
    reservationExpiresAt?: Date;
    quantity?: number;
    // DECISIONS.md ADR-030 — when set, mirrors a made-to-order line: no
    // StockReservation/reserved-increment at all, and the OrderItem
    // snapshots madeToOrder/productionTimeDaysSnapshot.
    madeToOrder?: { productionTimeDaysSnapshot: number | null };
  } = {},
): Promise<PendingOrderFixture> {
  const quantity = options.quantity ?? 1;
  const unitPriceMinor = variant.unitPriceMinor;
  const lineSubtotalMinor = unitPriceMinor * quantity;
  const totalMinor = lineSubtotalMinor + shop.shippingPriceMinor;

  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-${randomUUID()}`,
      guestEmail: "integration-test@example.com",
      locale: Locale.sv_SE,
      status: OrderStatus.PENDING_PAYMENT,
      currency: Currency.SEK,
      subtotalMinor: lineSubtotalMinor,
      shippingMinor: shop.shippingPriceMinor,
      taxMinor: 0,
      totalMinor,
      shippingMethodId: shop.shippingMethodId,
      shippingName: "Test Testsson",
      shippingLine1: "Testgatan 1",
      shippingPostalCode: "11122",
      shippingCity: "Stockholm",
      billingName: "Test Testsson",
      billingLine1: "Testgatan 1",
      billingPostalCode: "11122",
      billingCity: "Stockholm",
    },
  });

  const orderItem = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productVariantId: variant.variantId,
      productNameSnapshot: "Testprodukt",
      variantLabelSnapshot: "SKU",
      skuSnapshot: "SKU",
      unitPriceMinor,
      quantity,
      taxRatePercent: 25,
      lineSubtotalMinor,
      lineTotalMinor: lineSubtotalMinor,
      madeToOrder: options.madeToOrder !== undefined,
      productionTimeDaysSnapshot: options.madeToOrder?.productionTimeDaysSnapshot ?? null,
    },
  });

  let stockReservationId: string | null = null;
  if (!options.madeToOrder) {
    if (!options.reservationExpiresAt) {
      throw new Error("reservationExpiresAt is required unless madeToOrder is set");
    }
    await prisma.inventoryItem.update({
      where: { id: variant.inventoryItemId },
      data: { reserved: { increment: quantity } },
    });

    const stockReservation = await prisma.stockReservation.create({
      data: {
        orderItemId: orderItem.id,
        inventoryItemId: variant.inventoryItemId,
        quantity,
        status: StockReservationStatus.PENDING,
        expiresAt: options.reservationExpiresAt,
      },
    });
    stockReservationId = stockReservation.id;
  }

  const providerPaymentIntentId = `pi_test_${order.id}`;
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "stripe",
      providerPaymentIntentId,
      status: PaymentStatus.PENDING,
      amountMinor: totalMinor,
      currency: Currency.SEK,
    },
  });

  return {
    orderId: order.id,
    paymentId: payment.id,
    providerPaymentIntentId,
    orderItemId: orderItem.id,
    stockReservationId,
    inventoryItemId: variant.inventoryItemId,
  };
}
