import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderStatus, StockReservationStatus } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Idempotent: safe to call repeatedly, or concurrently from more than one
  // process. Each reservation is only released by whichever call "claims"
  // it via a conditional PENDING -> EXPIRED update (mirroring the same
  // guarded-update pattern InventoryService.adjustStock uses for the
  // not-negative guard) — a reservation already claimed by another
  // concurrent sweep, or not yet expired, is simply left alone. Each
  // order's reservations are released and the order canceled together in
  // one transaction, but orders are otherwise independent: one order's
  // outcome never affects another's.
  //
  // Abandoned-checkout handling (PAYMENTS.md §7, ROADMAP.md Phase 4) has a
  // second, independent branch below for orders a stock reservation can
  // never cover in the first place: an order made entirely of made-to-order
  // lines (every OrderItem.tracksStock false) gets no StockReservation at
  // all (checkout.service.ts only creates one per finite-stock line), so it
  // would otherwise sit in PENDING_PAYMENT forever with nothing to expire.
  // Reuses CHECKOUT_RESERVATION_TTL_MINUTES against Order.createdAt instead
  // of a StockReservation row — same "how long we wait for the customer to
  // pay" reasoning applies whether or not stock is actually at stake, and a
  // dedicated config value isn't worth it for this one edge case.
  async releaseExpiredReservations(now: Date = new Date()): Promise<ReservationExpiryResult> {
    let releasedReservations = 0;
    let canceledOrders = 0;

    const expired = await this.prisma.stockReservation.findMany({
      where: { status: StockReservationStatus.PENDING, expiresAt: { lte: now } },
      select: {
        id: true,
        inventoryItemId: true,
        quantity: true,
        orderItem: { select: { orderId: true } },
      },
    });

    if (expired.length > 0) {
      const byOrderId = new Map<string, typeof expired>();
      for (const reservation of expired) {
        const orderId = reservation.orderItem.orderId;
        const bucket = byOrderId.get(orderId);
        if (bucket) bucket.push(reservation);
        else byOrderId.set(orderId, [reservation]);
      }

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
    }

    const ttlMinutes = this.config.get("CHECKOUT_RESERVATION_TTL_MINUTES", { infer: true });
    const staleCutoff = new Date(now.getTime() - ttlMinutes * 60_000);
    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: { lte: staleCutoff },
        items: { every: { reservation: null } },
      },
      select: { id: true },
    });

    if (staleOrders.length > 0) {
      // A single guarded updateMany, not a transaction — there's no
      // reservation/inventory state to keep in sync alongside the status
      // flip here (that's exactly why these orders reached this branch),
      // so the WHERE clause alone is the whole race-safety story: any order
      // that transitioned away from PENDING_PAYMENT between the read above
      // and this write (e.g. a payment webhook just confirmed it) simply
      // doesn't match and is left alone.
      const canceled = await this.prisma.order.updateMany({
        where: {
          id: { in: staleOrders.map((order) => order.id) },
          status: OrderStatus.PENDING_PAYMENT,
        },
        data: { status: OrderStatus.CANCELED, canceledAt: now },
      });
      canceledOrders += canceled.count;
    }

    return { releasedReservations, canceledOrders };
  }
}
