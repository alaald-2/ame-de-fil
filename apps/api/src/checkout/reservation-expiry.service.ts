import { Injectable } from "@nestjs/common";
import { OrderStatus, StockReservationStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";

export interface ReservationExpiryResult {
  releasedReservations: number;
  canceledOrders: number;
}

// Reservation lifetime is 15 minutes (checkpoint requirement); this is the
// release side of that lifecycle. Triggered automatically by
// ReservationExpiryScheduler (reservation-expiry.scheduler.ts, an
// @nestjs/schedule-backed periodic sweep) and, for ops/manual use, by
// POST /admin/checkout/expire-reservations (admin-checkout.controller.ts)
// — the logic itself doesn't know or care which called it, since it's
// idempotent and safe to call repeatedly or concurrently from either path.
@Injectable()
export class ReservationExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  // Idempotent: safe to call repeatedly, or concurrently from more than one
  // process. Each reservation is only released by whichever call "claims"
  // it via a conditional PENDING -> EXPIRED update (mirroring the same
  // guarded-update pattern InventoryService.adjustStock uses for the
  // not-negative guard) — a reservation already claimed by another
  // concurrent sweep, or not yet expired, is simply left alone. Each
  // order's reservations are released and the order canceled together in
  // one transaction, but orders are otherwise independent: one order's
  // outcome never affects another's.
  async releaseExpiredReservations(now: Date = new Date()): Promise<ReservationExpiryResult> {
    const expired = await this.prisma.stockReservation.findMany({
      where: { status: StockReservationStatus.PENDING, expiresAt: { lte: now } },
      select: {
        id: true,
        inventoryItemId: true,
        quantity: true,
        orderItem: { select: { orderId: true } },
      },
    });

    if (expired.length === 0) {
      return { releasedReservations: 0, canceledOrders: 0 };
    }

    const byOrderId = new Map<string, typeof expired>();
    for (const reservation of expired) {
      const orderId = reservation.orderItem.orderId;
      const bucket = byOrderId.get(orderId);
      if (bucket) bucket.push(reservation);
      else byOrderId.set(orderId, [reservation]);
    }

    let releasedReservations = 0;
    let canceledOrders = 0;

    for (const [orderId, reservations] of byOrderId) {
      const result = await this.prisma.$transaction(async (tx) => {
        let released = 0;
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
          released += 1;
        }

        // Only cancels an order still awaiting payment — one already
        // confirmed (payment succeeded before expiry) or canceled by a
        // concurrent sweep is left untouched.
        const canceled = await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
          data: { status: OrderStatus.CANCELED, canceledAt: now },
        });

        return { released, canceled: canceled.count };
      });

      releasedReservations += result.released;
      canceledOrders += result.canceled;
    }

    return { releasedReservations, canceledOrders };
  }
}
