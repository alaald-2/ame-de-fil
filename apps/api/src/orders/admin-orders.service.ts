import { ConflictException, Injectable } from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import type { FulfillmentResponse } from "./dto/fulfillment-response.ts";

const NOT_IN_EXPECTED_STATE = (from: readonly OrderStatus[], to: OrderStatus) =>
  new ConflictException({
    error: "InvalidOrderTransition",
    message: `Order is not in ${from.map((s) => `"${s}"`).join(" or ")} — cannot transition to "${to}"`,
  });

// Admin fulfillment (PAYMENTS.md §3, DECISIONS.md ADR-022/ADR-030) — the
// manual counterpart to ManualShippingProvider's customer-facing quote
// path. Each transition is a guarded conditional update (`WHERE status =
// <expected>`), the same idiom as ReservationExpiryService/
// PaymentsWebhookService, not a read-then-write: a zero-row match means the
// order wasn't in the state this transition applies to, and throws rather
// than silently no-opping — unlike those two (which are intentionally
// idempotent no-ops for retried webhook/sweep deliveries), a *manual*
// admin action calling this on the wrong order state is a real mistake
// that should surface as an error.
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // READY_TO_SHIP has two valid predecessors (PAYMENTS.md §3): CONFIRMED
  // for ready-to-ship-only orders, IN_PRODUCTION once a made-to-order
  // order's production finishes (ADR-030) — the webhook branches an order
  // to one or the other at confirmation time, this transition accepts
  // whichever it landed on.
  private static readonly READY_TO_SHIP_PREDECESSORS = [
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PRODUCTION,
  ] as const;

  async markReadyToShip(
    orderId: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<FulfillmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      // Read solely for the audit entry's "before" value — the transition's
      // own correctness comes entirely from the guarded conditional update
      // below, never from this read (same non-TOCTOU reasoning as
      // InventoryService.adjustStock).
      const before = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });

      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: [...AdminOrdersService.READY_TO_SHIP_PREDECESSORS] } },
        data: { status: OrderStatus.READY_TO_SHIP },
      });
      if (updated.count === 0) {
        throw NOT_IN_EXPECTED_STATE(
          AdminOrdersService.READY_TO_SHIP_PREDECESSORS,
          OrderStatus.READY_TO_SHIP,
        );
      }

      await this.audit.record(
        {
          actorUserId,
          action: "order.ready_to_ship",
          entityType: "Order",
          entityId: orderId,
          before: { status: before.status },
          after: { status: OrderStatus.READY_TO_SHIP },
          ipAddress,
        },
        tx,
      );
    });

    return this.toResponse(orderId);
  }

  async markShipped(
    orderId: string,
    input: MarkShippedInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<FulfillmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.READY_TO_SHIP },
        data: { status: OrderStatus.SHIPPED },
      });
      if (updated.count === 0) {
        throw NOT_IN_EXPECTED_STATE([OrderStatus.READY_TO_SHIP], OrderStatus.SHIPPED);
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

      await this.audit.record(
        {
          actorUserId,
          action: "order.shipped",
          entityType: "Order",
          entityId: orderId,
          before: { status: OrderStatus.READY_TO_SHIP },
          after: {
            status: OrderStatus.SHIPPED,
            carrierName: input.carrierName ?? null,
            trackingNumber: input.trackingNumber ?? null,
          },
          ipAddress,
        },
        tx,
      );
    });

    // Dispatched only after the transaction above has committed — never
    // from inside it (DECISIONS.md ADR-031), for the same reason
    // PaymentsWebhookService fires its own order-confirmation notification
    // post-commit: an SMTP round-trip must never hold this transaction's
    // locks open, and NotificationsService never throws, so a slow/failed
    // send can never roll back the Order/Shipment write above.
    await this.notifications.sendShippingNotification(orderId);

    return this.toResponse(orderId);
  }

  async markDelivered(
    orderId: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<FulfillmentResponse> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.SHIPPED },
        data: { status: OrderStatus.DELIVERED },
      });
      if (updated.count === 0) {
        throw NOT_IN_EXPECTED_STATE([OrderStatus.SHIPPED], OrderStatus.DELIVERED);
      }

      const shipment = await tx.shipment.findFirstOrThrow({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "order.delivered",
          entityType: "Order",
          entityId: orderId,
          before: { status: OrderStatus.SHIPPED },
          after: { status: OrderStatus.DELIVERED },
          ipAddress,
        },
        tx,
      );
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
