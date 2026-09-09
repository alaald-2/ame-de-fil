import { Injectable, Logger } from "@nestjs/common";
import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  StockReservationStatus,
  type Prisma,
} from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import { lockOrderReservationsForUpdate } from "./order-reservation-lock.ts";
import type { VerifiedWebhookEvent } from "./payment-provider.ts";

// The authoritative payment/order state-transition logic (PAYMENTS.md §4,
// DATABASE.md §4). Deliberately provider-agnostic — receives only a
// VerifiedWebhookEvent, never a Stripe SDK type, so a future
// KlarnaPaymentProvider/SwishPaymentProvider (ADR-014) reuses this
// unchanged as long as it normalizes to the same shape.
@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(event: VerifiedWebhookEvent): Promise<void> {
    const claimed = await this.claimWebhookEvent(event);
    if (!claimed) return; // duplicate delivery of an event ID already seen — no-op (PAYMENTS.md §5)

    if (event.outcome === "irrelevant" || !event.providerPaymentIntentId) {
      await this.markProcessed(event.providerEventId);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { providerPaymentIntentId: event.providerPaymentIntentId! },
      });

      if (!payment) {
        // Should never happen given PaymentIntents are only ever created by
        // StripePaymentProvider.createPayment with a Payment row in the
        // same transaction — defensive, not a normal path.
        this.logger.warn(
          `Webhook event ${event.providerEventId} references unknown PaymentIntent "${event.providerPaymentIntentId}"`,
        );
      } else if (event.outcome === "succeeded") {
        await this.handleSucceeded(tx, payment, event);
      } else {
        await this.handleFailedOrCanceled(tx, payment, event);
      }

      await tx.webhookEvent.update({
        where: { id: event.providerEventId },
        data: { processedAt: new Date() },
      });
    });
  }

  private async claimWebhookEvent(event: VerifiedWebhookEvent): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: event.providerEventId,
          provider: "stripe",
          eventType: event.eventType,
          payload: event.raw as Prisma.InputJsonValue,
          processedAt: null,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error, "id")) return false;
      throw error;
    }
  }

  private async markProcessed(eventId: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }

  // Guarded by the PENDING -> PAID updateMany below: if another concurrent
  // delivery of a *different* event already advanced this exact Payment
  // (e.g. a retried succeeded delivery racing itself), count is 0 and
  // everything past it — the PaymentAttempt row, the order/stock
  // transition — is skipped, leaving this call a pure no-op past that
  // point. Idempotent by construction, not by a prior read-then-check.
  private async handleSucceeded(
    tx: Prisma.TransactionClient,
    payment: { id: string; orderId: string },
    event: VerifiedWebhookEvent,
  ): Promise<void> {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PAID },
    });
    if (updated.count === 0) return;

    await tx.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        status: PaymentStatus.PAID,
        providerEventId: event.providerEventId,
        rawPayload: event.raw as Prisma.InputJsonValue,
      },
    });

    await this.confirmOrderOrFlagStockLost(tx, payment.orderId);
  }

  // DATABASE.md §4 step 3 / PAYMENTS.md: money has been taken (Payment is
  // already PAID by the time this runs) — the only question left is
  // whether the reserved stock is still actually held. Reservations are
  // locked first (order-reservation-lock.ts) specifically so this decision
  // is race-safe against the concurrent reservation-expiry sweep, not a
  // stale read.
  private async confirmOrderOrFlagStockLost(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const reservations = await lockOrderReservationsForUpdate(tx, orderId);
    const stockLost = reservations.some((r) => r.status !== StockReservationStatus.PENDING);

    if (stockLost) {
      // At least one reservation this order needed was already released
      // (expired) before this webhook arrived. Never oversell and never
      // silently keep the money for nothing (PRODUCT_SPEC.md §7): leave
      // every reservation exactly as locked-and-read (no consumption, no
      // inventory movement for *any* line of this order, even the ones
      // still PENDING) and surface it for manual admin resolution instead.
      await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST },
      });
      return;
    }

    for (const reservation of reservations) {
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: { status: StockReservationStatus.CONSUMED },
      });
      await tx.inventoryItem.update({
        where: { id: reservation.inventoryItemId },
        data: {
          onHand: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: reservation.inventoryItemId,
          type: InventoryMovementType.SALE,
          quantity: -reservation.quantity,
          relatedOrderItemId: reservation.orderItemId,
        },
      });
    }

    // Made-to-order lines (tracksStock=false) have no StockReservation row
    // at all and never blocked this — an order with zero reservations
    // (all made-to-order) confirms here too, having taken no action above.
    await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: { status: OrderStatus.CONFIRMED, confirmedAt: new Date() },
    });
  }

  private async handleFailedOrCanceled(
    tx: Prisma.TransactionClient,
    payment: { id: string; orderId: string },
    event: VerifiedWebhookEvent,
  ): Promise<void> {
    const nextStatus = event.outcome === "failed" ? PaymentStatus.FAILED : PaymentStatus.CANCELED;

    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: nextStatus },
    });
    if (updated.count === 0) return;

    await tx.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        status: nextStatus,
        providerEventId: event.providerEventId,
        rawPayload: event.raw as Prisma.InputJsonValue,
      },
    });

    // Release the reservation immediately rather than waiting out the TTL
    // (DECISIONS.md ADR-024) — a definitive failure/cancellation means the
    // customer is not going to pay via this attempt, so holding stock any
    // longer only delays their ability to retry checkout. Mirrors
    // ReservationExpiryService's guarded-release idiom, order-scoped here
    // rather than system-wide.
    await this.releasePendingReservationsAndCancelOrder(tx, payment.orderId);
  }

  private async releasePendingReservationsAndCancelOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderItem: { orderId }, status: StockReservationStatus.PENDING },
      select: { id: true, inventoryItemId: true, quantity: true },
    });

    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: StockReservationStatus.PENDING },
        data: { status: StockReservationStatus.EXPIRED },
      });
      if (claimed.count === 0) continue; // already released by a concurrent sweep

      await tx.inventoryItem.update({
        where: { id: reservation.inventoryItemId },
        data: { reserved: { decrement: reservation.quantity } },
      });
    }

    await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: { status: OrderStatus.CANCELED, canceledAt: new Date() },
    });
  }
}
