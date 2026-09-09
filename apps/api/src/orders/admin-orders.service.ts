import { ConflictException, Injectable } from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import type { MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import type { FulfillmentResponse } from "./dto/fulfillment-response.ts";

const NOT_IN_EXPECTED_STATE = (from: OrderStatus, to: OrderStatus) =>
  new ConflictException({
    error: "InvalidOrderTransition",
    message: `Order is not in "${from}" — cannot transition to "${to}"`,
  });

// Admin fulfillment (PAYMENTS.md §3, DECISIONS.md ADR-022) — the manual
// counterpart to ManualShippingProvider's customer-facing quote path. Each
// transition is a guarded conditional update (`WHERE status = <expected>`),
// the same idiom as ReservationExpiryService/PaymentsWebhookService, not a
// read-then-write: a zero-row match means the order wasn't in the state
// this transition applies to, and throws rather than silently no-opping —
// unlike those two (which are intentionally idempotent no-ops for retried
// webhook/sweep deliveries), a *manual* admin action calling this on the
// wrong order state is a real mistake that should surface as an error.
//
// Deliberately scoped to CONFIRMED -> READY_TO_SHIP -> SHIPPED -> DELIVERED
// only — the IN_PRODUCTION branch and productionTimeDays tracking for
// made-to-order items are the separate "made-to-order production-time
// flow" roadmap item, not built here (ROADMAP.md Phase 4).
@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async markReadyToShip(orderId: string): Promise<FulfillmentResponse> {
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.CONFIRMED },
      data: { status: OrderStatus.READY_TO_SHIP },
    });
    if (updated.count === 0) {
      throw NOT_IN_EXPECTED_STATE(OrderStatus.CONFIRMED, OrderStatus.READY_TO_SHIP);
    }

    return this.toResponse(orderId);
  }

  async markShipped(orderId: string, input: MarkShippedInput): Promise<FulfillmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.READY_TO_SHIP },
        data: { status: OrderStatus.SHIPPED },
      });
      if (updated.count === 0) {
        throw NOT_IN_EXPECTED_STATE(OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED);
      }

      // A plain create, not an upsert: Shipment.orderId is a plain indexed
      // FK, not @unique — the schema already allows multiple Shipment rows
      // per order (a future partial-shipment case), so there is no unique
      // key an upsert could target. v1's manual flow only ever produces
      // one per order in practice.
      await tx.shipment.create({
        data: {
          orderId,
          status: ShipmentStatus.IN_TRANSIT,
          carrierName: input.carrierName ?? null,
          trackingNumber: input.trackingNumber ?? null,
          trackingUrl: input.trackingUrl ?? null,
          shippedAt: new Date(),
        },
      });
    });

    return this.toResponse(orderId);
  }

  async markDelivered(orderId: string): Promise<FulfillmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.SHIPPED },
        data: { status: OrderStatus.DELIVERED },
      });
      if (updated.count === 0) {
        throw NOT_IN_EXPECTED_STATE(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
      }

      const shipment = await tx.shipment.findFirstOrThrow({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() },
      });
    });

    return this.toResponse(orderId);
  }

  private async toResponse(orderId: string): Promise<FulfillmentResponse> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    const shipment = await this.prisma.shipment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });

    return {
      orderId: order.id,
      status: order.status,
      shipment: shipment
        ? {
            status: shipment.status,
            carrierName: shipment.carrierName,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: shipment.trackingUrl,
            shippedAt: shipment.shippedAt?.toISOString() ?? null,
            deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
