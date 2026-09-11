import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Currency,
  OrderStatus,
  ProductStatus,
  StockReservationStatus,
  type OrderItem,
} from "@ame-de-fil/database";
import { DEFAULT_LOCALE } from "@ame-de-fil/validation";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import { cartIdentityWhere, type CartIdentity } from "../common/cart-identity.ts";
import { toPrismaLocale } from "../common/locale.ts";
import { generateOrderStatusToken, hashOrderStatusToken } from "../common/order-status-token.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { SHIPPING_PROVIDER, type ShippingProvider } from "../shipping/shipping-provider.ts";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/payment-provider.ts";
import { CHECKOUT_CART_INCLUDE, buildOrderItemSnapshot } from "./checkout-cart.ts";
import { getCurrentTaxRatesByClassId, getShippingTaxRatePercent } from "./tax-rates.ts";
import { resolveActivePromotionsForVariants } from "../promotions/effective-price.ts";
import { computeOrderTotals } from "./pricing.ts";
import { lockInventoryItemsForUpdate } from "./stock-lock.ts";
import { generateOrderNumber } from "./order-number.ts";
import { CHECKOUT_IDEMPOTENCY_SCOPE, hashCheckoutRequest } from "./idempotency.ts";
import { isUniqueConstraintViolation } from "./prisma-errors.ts";
import { mapCheckoutResponse } from "./mappers/checkout-response.mapper.ts";
import type { InitiateCheckoutInput } from "./dto/initiate-checkout.dto.ts";
import type { CheckoutResponse } from "./dto/responses.ts";

const MAX_ORDER_NUMBER_ATTEMPTS = 3;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SHIPPING_PROVIDER) private readonly shippingProvider: ShippingProvider,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async initiate(
    identity: CartIdentity,
    auth: AuthContext | undefined,
    idempotencyKey: string,
    input: InitiateCheckoutInput,
  ): Promise<CheckoutResponse> {
    if (!auth && !input.guestEmail) {
      throw new BadRequestException({
        error: "GuestEmailRequired",
        message: "guestEmail is required for guest checkout",
      });
    }

    const requestHash = hashCheckoutRequest(identity, input);
    const now = new Date();

    const replay = await this.checkForReplayOrConflict(idempotencyKey, requestHash, now);
    if (replay) return replay;

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      const orderNumber = generateOrderNumber(now);
      try {
        return await this.runCheckout(
          identity,
          auth,
          idempotencyKey,
          requestHash,
          input,
          now,
          orderNumber,
        );
      } catch (error) {
        if (isUniqueConstraintViolation(error, "Order", "orderNumber")) {
          lastError = error;
          continue; // collided with another order's number — try a fresh one
        }
        if (isUniqueConstraintViolation(error, "IdempotencyKey", "key")) {
          // Lost a genuine concurrent race for this exact Idempotency-Key:
          // another request with the identical key committed first. Replay
          // its result rather than surfacing a raw constraint error — this
          // is still "the same request," just resolved by whichever
          // transaction won.
          const winner = await this.prisma.idempotencyKey.findUnique({
            where: { key: idempotencyKey },
          });
          if (winner) return winner.responseSnapshot as CheckoutResponse;
        }
        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to generate a unique order number after multiple attempts");
  }

  private async checkForReplayOrConflict(
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<CheckoutResponse | null> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (!existing) return null;

    if (existing.expiresAt.getTime() > now.getTime()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          error: "IdempotencyKeyConflict",
          message: "This Idempotency-Key was already used for a different checkout request",
        });
      }
      return existing.responseSnapshot as CheckoutResponse;
    }

    // Expired — reclaim the key so a fresh attempt can use it.
    await this.prisma.idempotencyKey
      .delete({ where: { key: idempotencyKey } })
      .catch(() => undefined);
    return null;
  }

  private async runCheckout(
    identity: CartIdentity,
    auth: AuthContext | undefined,
    idempotencyKey: string,
    requestHash: string,
    input: InitiateCheckoutInput,
    now: Date,
    orderNumber: string,
  ): Promise<CheckoutResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load the caller's own cart fresh, inside the transaction — the
      // client never submits cart contents to checkout (checkpoint rule).
      const cart = await tx.cart.findUnique({
        where: cartIdentityWhere(identity),
        include: CHECKOUT_CART_INCLUDE,
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException({ error: "EmptyCart", message: "Your cart is empty" });
      }

      // 2. Re-validate every item is still currently purchasable — a
      // product/variant can have been unpublished or deactivated since it
      // was added to the cart.
      for (const item of cart.items) {
        if (!item.variant.isActive || item.variant.product.status !== ProductStatus.PUBLISHED) {
          throw new BadRequestException({
            error: "InvalidCartItem",
            message: `"${item.variant.sku}" is no longer available for purchase`,
            sku: item.variant.sku,
          });
        }
      }

      // 3. Shipping method, re-read transactionally through the approved
      // ShippingProvider abstraction (ManualShippingProvider for v1).
      const shippingQuote = await this.shippingProvider.getQuote(tx, input.shippingMethodId);
      if (!shippingQuote) {
        throw new BadRequestException({
          error: "InvalidShippingMethod",
          message: "The selected shipping method is not available",
        });
      }

      // 4. Current VAT rates — server-authoritative, never client-submitted.
      const taxClassIds = cart.items.map((item) => item.variant.taxClassId);
      const taxRates = await getCurrentTaxRatesByClassId(tx, taxClassIds, now);
      const shippingTaxRate = await getShippingTaxRatePercent(tx, now);

      // 4.5. Current active promotions — resolved the same way tax rates
      // are, in one batched query, then applied per-line below. This is the
      // one and only place checkout ever substitutes a variant's base price
      // for a promotion's effective price (checkout-cart.ts's
      // buildOrderItemSnapshot); the client never supplies or influences it.
      const variantIds = cart.items.map((item) => item.variant.id);
      const activePromotions = await resolveActivePromotionsForVariants(tx, variantIds, now);

      // 5. Price every line from live variant data and compute order totals.
      const linePlans = cart.items.map((item) => {
        const rate = taxRates.get(item.variant.taxClassId);
        if (rate === undefined) {
          throw new Error(`Missing resolved tax rate for taxClass "${item.variant.taxClassId}"`);
        }
        const promotion = activePromotions.get(item.variant.id);
        return {
          item,
          snapshot: buildOrderItemSnapshot(item, input.locale, DEFAULT_LOCALE, rate, promotion),
        };
      });
      const totals = computeOrderTotals(
        linePlans.map((plan) => plan.snapshot),
        shippingQuote.priceMinor,
        shippingTaxRate,
      );

      // 6. Lock + verify + reserve stock — finite-stock items only.
      // Made-to-order variants (tracksStock=false) stay outside reservation
      // behavior entirely, per the existing inventory model.
      const stockPlans = linePlans.filter((plan) => plan.item.variant.inventoryItem?.tracksStock);
      const inventoryItemIds = stockPlans.map((plan) => plan.item.variant.inventoryItem!.id);
      const lockedRows = await lockInventoryItemsForUpdate(tx, inventoryItemIds);

      for (const plan of stockPlans) {
        const inventoryId = plan.item.variant.inventoryItem!.id;
        const row = lockedRows.get(inventoryId);
        if (!row) {
          throw new Error(
            `Locked inventory row "${inventoryId}" was not returned by the lock query`,
          );
        }
        const availableQuantity = row.onHand - row.reserved;
        if (availableQuantity < plan.item.quantity) {
          throw new BadRequestException({
            error: "InsufficientStock",
            message: `Only ${availableQuantity} unit(s) of "${plan.item.variant.sku}" available`,
            sku: plan.item.variant.sku,
            availableQuantity,
          });
        }
      }

      // 7. Create the Order — the authoritative, immutable snapshot
      // (DATABASE.md §5): prices/tax/shipping/address are all copied in
      // here, never reconstructed later from the live Product/pricing tables.
      const billing = input.billingAddress ?? input.shippingAddress;
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: auth?.userId ?? null,
          guestEmail: auth ? null : (input.guestEmail ?? null),
          locale: toPrismaLocale(input.locale),
          status: OrderStatus.PENDING_PAYMENT,
          currency: Currency.SEK,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          shippingMinor: totals.shippingMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          shippingMethodId: shippingQuote.shippingMethodId,
          shippingName: input.shippingAddress.name,
          shippingLine1: input.shippingAddress.line1,
          shippingLine2: input.shippingAddress.line2 ?? null,
          shippingPostalCode: input.shippingAddress.postalCode,
          shippingCity: input.shippingAddress.city,
          shippingCountry: input.shippingAddress.country,
          shippingPhone: input.shippingAddress.phone ?? null,
          billingName: billing.name,
          billingLine1: billing.line1,
          billingLine2: billing.line2 ?? null,
          billingPostalCode: billing.postalCode,
          billingCity: billing.city,
          billingCountry: billing.country,
          billingPhone: billing.phone ?? null,
        },
      });

      // 8. Create OrderItems, then reservations for finite-stock lines only.
      const ttlMinutes = this.config.get("CHECKOUT_RESERVATION_TTL_MINUTES", { infer: true });
      const reservationExpiresAt =
        stockPlans.length > 0 ? new Date(now.getTime() + ttlMinutes * 60_000) : null;

      const createdItems: OrderItem[] = [];
      for (const plan of linePlans) {
        // lineTaxMinor is an intermediate value consumed by
        // computeOrderTotals above (rolled up into Order.taxMinor) — it has
        // no matching OrderItem column (schema.prisma only persists
        // lineSubtotalMinor/lineTotalMinor per line) and must not be spread
        // into the create payload.
        const { lineTaxMinor: _lineTaxMinor, ...orderItemData } = plan.snapshot;
        const orderItem = await tx.orderItem.create({
          data: { orderId: order.id, ...orderItemData },
        });
        createdItems.push(orderItem);

        const inventory = plan.item.variant.inventoryItem;
        if (inventory?.tracksStock) {
          await tx.inventoryItem.update({
            where: { id: inventory.id },
            data: { reserved: { increment: plan.item.quantity } },
          });
          await tx.stockReservation.create({
            data: {
              orderItemId: orderItem.id,
              inventoryItemId: inventory.id,
              quantity: plan.item.quantity,
              status: StockReservationStatus.PENDING,
              expiresAt: reservationExpiresAt!,
            },
          });
        }
      }

      // 9. Payment boundary — records a PENDING Payment row via the
      // PaymentProvider abstraction; no real processor is contacted (that's
      // the next checkpoint's job).
      const payment = await this.paymentProvider.createPayment(tx, {
        orderId: order.id,
        amountMinor: totals.totalMinor,
        currency: "SEK",
      });

      // 10. The cart that was just checked out is now spent.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      // 10.5. Guest order-status polling credential (PAYMENTS.md §4,
      // DECISIONS.md ADR-024) — issued once, here, alongside the order it's
      // scoped to. Only the SHA-256 hash is persisted; the plaintext token
      // is returned in the response below and never retrievable again.
      // Authenticated callers are authorized via Order.userId ownership
      // instead (orders.service.ts) but still receive this uniformly.
      const orderStatusToken = generateOrderStatusToken();
      const orderStatusTokenTtlHours = this.config.get("ORDER_STATUS_TOKEN_TTL_HOURS", {
        infer: true,
      });
      await tx.orderStatusToken.create({
        data: {
          orderId: order.id,
          tokenHash: hashOrderStatusToken(orderStatusToken),
          expiresAt: new Date(now.getTime() + orderStatusTokenTtlHours * 60 * 60 * 1000),
        },
      });

      const response = mapCheckoutResponse(
        order,
        createdItems,
        payment,
        shippingQuote,
        input.locale,
        reservationExpiresAt,
        orderStatusToken,
      );

      // 11. Idempotency record — a plain `create` (never upsert) so that
      // two genuinely concurrent requests sharing this exact key can never
      // both succeed: whichever transaction commits first wins this
      // insert, and the loser's unique-constraint violation rolls its
      // entire transaction back (its order/reservation/payment never
      // persist) — see the P2002 "key" handling in initiate().
      const idempotencyTtlHours = this.config.get("CHECKOUT_IDEMPOTENCY_TTL_HOURS", {
        infer: true,
      });
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          scope: CHECKOUT_IDEMPOTENCY_SCOPE,
          requestHash,
          responseSnapshot: response,
          expiresAt: new Date(now.getTime() + idempotencyTtlHours * 60 * 60 * 1000),
        },
      });

      return response;
    });
  }
}
