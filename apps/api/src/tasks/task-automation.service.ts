import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  TaskSource,
  TaskStatus,
  TaskType,
} from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import { InventoryService } from "../inventory/inventory.service.ts";

const DAY_MS = 86_400_000;
const CLOSE_DATA = (now: Date) => ({ status: TaskStatus.DONE, completedAt: now }) as const;

export interface TaskAutomationResult {
  created: number;
  closed: number;
}

// Read-only reader of Order/OrderItem/InventoryItem/Refund/Payment, and the
// ONLY writer of AUTOMATED Task rows — it never mutates any of those source
// tables, so this feature adds no risk to admin-orders.service.ts/
// inventory.service.ts/payments/* business logic, which this class never
// calls anything on except InventoryService.listLowStock (a pre-existing
// read method, reused as-is, never modified).
//
// Every generation step is a bounded `createMany({ skipDuplicates: true })`
// keyed on Task.dedupeKey — race-safe under concurrent sweeps (relies on
// the DB unique constraint, same idempotency posture as
// ReservationExpiryService's guarded updates) and, unlike an
// upsert+`update: {}`, never bumps `updatedAt` on a task that already
// exists and hasn't actually changed.
//
// Every close step starts from the small set of currently-OPEN AUTOMATED
// tasks of that type (never a full scan of the source table) and
// cross-checks only those specific linked rows' current state — the same
// "small candidate set, verify against current truth" shape used
// throughout. dedupeKey encodes the source row's id (`refund:{id}:...`,
// `payment:{id}:...`) deliberately, so a close step can recover it via
// `dedupeKey.split(":")[1]` instead of Task needing a dedicated refundId/
// paymentId column just for this.
@Injectable()
export class TaskAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Sequential, not Promise.all — this runs on a periodic background timer
  // (not on any request's latency path), so there's no reason to hold up to
  // fourteen queries open against the pool at once; same "just iterate"
  // posture as ReservationExpiryService's own sweep loop.
  async runSweep(now: Date = new Date()): Promise<TaskAutomationResult> {
    let created = 0;
    let closed = 0;

    created += await this.generateProductionChecklist(now);
    closed += await this.closeProductionChecklist(now);
    created += await this.generateShipOrder(now);
    closed += await this.closeShipOrder(now);
    created += await this.generateDelayedOrderFollowUps(now);
    closed += await this.closeDelayedOrderFollowUps(now);
    created += await this.generateRestockTasks();
    closed += await this.closeRestockTasks(now);
    created += await this.generateRefundCompletedFollowUps(now);
    created += await this.generatePendingRefundFollowUps(now);
    closed += await this.closePendingRefundFollowUps(now);
    created += await this.generateFailedRefundFollowUps(now);
    created += await this.generateDisputeReviews();
    closed += await this.closeDisputeReviews(now);

    return { created, closed };
  }

  // START_PRODUCTION/FINISH_PRODUCTION/QUALITY_CHECK/PACK_ORDER — generated
  // together for every IN_PRODUCTION order (the state a made-to-order order
  // lands on directly at confirmation, ROADMAP.md Phase 4's "Made-to-order
  // production-time flow"). Due date for the latter three is
  // confirmedAt + the longest productionTimeDaysSnapshot among the order's
  // made-to-order items — per-order, not per-item, since there is no
  // per-item production status to auto-close against individually.
  private async generateProductionChecklist(now: Date): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.IN_PRODUCTION },
      select: {
        id: true,
        orderNumber: true,
        confirmedAt: true,
        items: { where: { madeToOrder: true }, select: { productionTimeDaysSnapshot: true } },
      },
    });
    if (orders.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = [];
    for (const order of orders) {
      const maxDays = order.items.reduce((max, item) => Math.max(max, item.productionTimeDaysSnapshot ?? 0), 0);
      const finishDue = order.confirmedAt ? new Date(order.confirmedAt.getTime() + maxDays * DAY_MS) : null;

      data.push(
        {
          type: TaskType.START_PRODUCTION,
          source: TaskSource.AUTOMATED,
          dedupeKey: `order:${order.id}:START_PRODUCTION`,
          dueAt: now,
          title: `Start production — Order ${order.orderNumber}`,
          orderId: order.id,
        },
        {
          type: TaskType.FINISH_PRODUCTION,
          source: TaskSource.AUTOMATED,
          dedupeKey: `order:${order.id}:FINISH_PRODUCTION`,
          dueAt: finishDue,
          title: `Finish production — Order ${order.orderNumber}`,
          orderId: order.id,
        },
        {
          type: TaskType.QUALITY_CHECK,
          source: TaskSource.AUTOMATED,
          dedupeKey: `order:${order.id}:QUALITY_CHECK`,
          dueAt: finishDue,
          title: `Quality check — Order ${order.orderNumber}`,
          orderId: order.id,
        },
        {
          type: TaskType.PACK_ORDER,
          source: TaskSource.AUTOMATED,
          dedupeKey: `order:${order.id}:PACK_ORDER`,
          dueAt: finishDue,
          title: `Pack order — Order ${order.orderNumber}`,
          orderId: order.id,
        },
      );
    }

    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  // The one real signal that exists for "production/QC/packing are done" —
  // an order reaching READY_TO_SHIP or beyond. Closes all four checklist
  // tasks together; an admin can still tick them individually beforehand,
  // this is only the backstop.
  private async closeProductionChecklist(now: Date): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED] } },
      select: { id: true },
    });
    if (orders.length === 0) return 0;

    const result = await this.prisma.task.updateMany({
      where: {
        orderId: { in: orders.map((o) => o.id) },
        type: { in: [TaskType.START_PRODUCTION, TaskType.FINISH_PRODUCTION, TaskType.QUALITY_CHECK, TaskType.PACK_ORDER] },
        status: TaskStatus.OPEN,
        source: TaskSource.AUTOMATED,
      },
      data: CLOSE_DATA(now),
    });
    return result.count;
  }

  private async generateShipOrder(now: Date): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.READY_TO_SHIP },
      select: { id: true, orderNumber: true },
    });
    if (orders.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = orders.map((order) => ({
      type: TaskType.SHIP_ORDER,
      source: TaskSource.AUTOMATED,
      dedupeKey: `order:${order.id}:SHIP_ORDER`,
      dueAt: now,
      title: `Ship order — Order ${order.orderNumber}`,
      orderId: order.id,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async closeShipOrder(now: Date): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.COMPLETED] } },
      select: { id: true },
    });
    if (orders.length === 0) return 0;

    const result = await this.prisma.task.updateMany({
      where: { orderId: { in: orders.map((o) => o.id) }, type: TaskType.SHIP_ORDER, status: TaskStatus.OPEN, source: TaskSource.AUTOMATED },
      data: CLOSE_DATA(now),
    });
    return result.count;
  }

  // Only IN_PRODUCTION orders past their own computed FINISH_PRODUCTION due
  // date by TASK_DELAYED_ORDER_GRACE_DAYS — a READY_TO_SHIP order's urgency
  // is already carried by its ever-present SHIP_ORDER task (due
  // immediately on creation), so it doesn't need a second, redundant
  // follow-up task layered on top.
  private async generateDelayedOrderFollowUps(now: Date): Promise<number> {
    const graceDays = this.config.get("TASK_DELAYED_ORDER_GRACE_DAYS", { infer: true });
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.IN_PRODUCTION },
      select: {
        id: true,
        orderNumber: true,
        confirmedAt: true,
        items: { where: { madeToOrder: true }, select: { productionTimeDaysSnapshot: true } },
      },
    });
    if (orders.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = [];
    for (const order of orders) {
      if (!order.confirmedAt) continue;
      const maxDays = order.items.reduce((max, item) => Math.max(max, item.productionTimeDaysSnapshot ?? 0), 0);
      const finishDue = order.confirmedAt.getTime() + maxDays * DAY_MS;
      const graceCutoff = finishDue + graceDays * DAY_MS;
      if (graceCutoff >= now.getTime()) continue;

      data.push({
        type: TaskType.FOLLOW_UP_DELAYED_ORDER,
        source: TaskSource.AUTOMATED,
        dedupeKey: `order:${order.id}:FOLLOW_UP_DELAYED_ORDER`,
        dueAt: now,
        title: `Follow up — production running late, Order ${order.orderNumber}`,
        orderId: order.id,
      });
    }
    if (data.length === 0) return 0;

    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async closeDelayedOrderFollowUps(now: Date): Promise<number> {
    const openTasks = await this.prisma.task.findMany({
      where: { type: TaskType.FOLLOW_UP_DELAYED_ORDER, status: TaskStatus.OPEN, source: TaskSource.AUTOMATED, orderId: { not: null } },
      select: { id: true, orderId: true },
    });
    if (openTasks.length === 0) return 0;

    const stillInProduction = await this.prisma.order.findMany({
      where: { id: { in: openTasks.map((t) => t.orderId!) }, status: OrderStatus.IN_PRODUCTION },
      select: { id: true },
    });
    const stillInProductionIds = new Set(stillInProduction.map((o) => o.id));
    const toClose = openTasks.filter((t) => !stillInProductionIds.has(t.orderId!)).map((t) => t.id);
    if (toClose.length === 0) return 0;

    const result = await this.prisma.task.updateMany({ where: { id: { in: toClose } }, data: CLOSE_DATA(now) });
    return result.count;
  }

  // Reuses InventoryService.listLowStock verbatim — the exact predicate the
  // existing /admin/inventory/low-stock endpoint and dashboard alert count
  // already use, never re-implemented here. pageSize is well over any
  // realistic low-stock count for this business; not paginated further
  // since this is an internal sweep, not an HTTP response.
  private async generateRestockTasks(): Promise<number> {
    const lowStock = await this.inventory.listLowStock(1, 1000);
    if (lowStock.items.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = lowStock.items.map((item) => ({
      type: TaskType.RESTOCK,
      source: TaskSource.AUTOMATED,
      dedupeKey: `variant:${item.variantId}:RESTOCK`,
      title: `Restock — ${item.productName} (Art. ${item.articleNumber})`,
      productVariantId: item.variantId,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async closeRestockTasks(now: Date): Promise<number> {
    const openTasks = await this.prisma.task.findMany({
      where: { type: TaskType.RESTOCK, status: TaskStatus.OPEN, source: TaskSource.AUTOMATED, productVariantId: { not: null } },
      select: { id: true, productVariantId: true },
    });
    if (openTasks.length === 0) return 0;

    const lowStock = await this.inventory.listLowStock(1, 1000);
    const stillLowStockVariantIds = new Set(lowStock.items.map((i) => i.variantId));
    const toClose = openTasks.filter((t) => !stillLowStockVariantIds.has(t.productVariantId!)).map((t) => t.id);
    if (toClose.length === 0) return 0;

    const result = await this.prisma.task.updateMany({ where: { id: { in: toClose } }, data: CLOSE_DATA(now) });
    return result.count;
  }

  // Bounded to a 30-day lookback — a refund resolved (SUCCEEDED/FAILED)
  // longer ago than that either already has its task (this createMany is a
  // no-op for it via skipDuplicates) or predates this feature entirely and
  // is deliberately not backfilled, the same "no infinite historical
  // backfill" posture as every other bounded window here.
  private lookbackCutoff(now: Date, days: number): Date {
    return new Date(now.getTime() - days * DAY_MS);
  }

  private async generateRefundCompletedFollowUps(now: Date): Promise<number> {
    const delayDays = this.config.get("TASK_REFUND_FOLLOWUP_DELAY_DAYS", { infer: true });
    const refunds = await this.prisma.refund.findMany({
      where: { status: RefundStatus.SUCCEEDED, processedAt: { gte: this.lookbackCutoff(now, 30) } },
      select: {
        id: true,
        processedAt: true,
        payment: { select: { orderId: true, order: { select: { orderNumber: true, userId: true } } } },
      },
    });
    if (refunds.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = refunds.map((refund) => ({
      type: TaskType.CUSTOMER_FOLLOW_UP,
      source: TaskSource.AUTOMATED,
      dedupeKey: `refund:${refund.id}:CUSTOMER_FOLLOW_UP`,
      dueAt: new Date((refund.processedAt ?? now).getTime() + delayDays * DAY_MS),
      title: `Follow up with customer — refund completed, Order ${refund.payment.order.orderNumber}`,
      orderId: refund.payment.orderId,
      customerUserId: refund.payment.order.userId,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  // Covers PAYMENTS.md §6's disclosed gap directly: a refund whose Stripe
  // call returned a non-terminal status has no reconciliation job — this is
  // the mitigation, not a duplicate of one.
  private async generatePendingRefundFollowUps(now: Date): Promise<number> {
    const hours = this.config.get("TASK_REFUND_PENDING_FOLLOWUP_HOURS", { infer: true });
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const refunds = await this.prisma.refund.findMany({
      where: { status: RefundStatus.PENDING, createdAt: { lte: cutoff } },
      select: { id: true, payment: { select: { orderId: true, order: { select: { orderNumber: true } } } } },
    });
    if (refunds.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = refunds.map((refund) => ({
      type: TaskType.FOLLOW_UP_PENDING_REFUND,
      source: TaskSource.AUTOMATED,
      dedupeKey: `refund:${refund.id}:FOLLOW_UP_PENDING_REFUND`,
      dueAt: now,
      title: `Refund stuck pending — Order ${refund.payment.order.orderNumber}`,
      orderId: refund.payment.orderId,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async closePendingRefundFollowUps(now: Date): Promise<number> {
    const openTasks = await this.prisma.task.findMany({
      where: { type: TaskType.FOLLOW_UP_PENDING_REFUND, status: TaskStatus.OPEN, source: TaskSource.AUTOMATED },
      select: { id: true, dedupeKey: true },
    });
    if (openTasks.length === 0) return 0;

    const refundIds = openTasks.map((t) => t.dedupeKey!.split(":")[1]!);
    const stillPending = await this.prisma.refund.findMany({
      where: { id: { in: refundIds }, status: RefundStatus.PENDING },
      select: { id: true },
    });
    const stillPendingIds = new Set(stillPending.map((r) => r.id));
    const toClose = openTasks.filter((t) => !stillPendingIds.has(t.dedupeKey!.split(":")[1]!)).map((t) => t.id);
    if (toClose.length === 0) return 0;

    const result = await this.prisma.task.updateMany({ where: { id: { in: toClose } }, data: CLOSE_DATA(now) });
    return result.count;
  }

  // No auto-close: resolving a FAILED refund (retry, contact the customer,
  // write it off) is a human decision, not an observable state transition
  // this sweep can detect on its own.
  private async generateFailedRefundFollowUps(now: Date): Promise<number> {
    const refunds = await this.prisma.refund.findMany({
      where: { status: RefundStatus.FAILED, createdAt: { gte: this.lookbackCutoff(now, 30) } },
      select: { id: true, payment: { select: { orderId: true, order: { select: { orderNumber: true } } } } },
    });
    if (refunds.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = refunds.map((refund) => ({
      type: TaskType.FOLLOW_UP_FAILED_REFUND,
      source: TaskSource.AUTOMATED,
      dedupeKey: `refund:${refund.id}:FOLLOW_UP_FAILED_REFUND`,
      dueAt: now,
      title: `Refund failed — needs attention, Order ${refund.payment.order.orderNumber}`,
      orderId: refund.payment.orderId,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  // No due date is fabricated — Stripe's real chargeback response deadline
  // isn't stored anywhere in this schema (PaymentsWebhookService
  // acknowledges dispute events but doesn't act on them beyond the status
  // flip), so inventing one here would look authoritative while being made
  // up. Left null; the admin sets the real deadline from Stripe's own
  // dashboard.
  private async generateDisputeReviews(): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.DISPUTED },
      select: { id: true, orderId: true, order: { select: { orderNumber: true } } },
    });
    if (payments.length === 0) return 0;

    const data: Prisma.TaskCreateManyInput[] = payments.map((payment) => ({
      type: TaskType.REVIEW_DISPUTE,
      source: TaskSource.AUTOMATED,
      dedupeKey: `payment:${payment.id}:REVIEW_DISPUTE`,
      title: `Review payment dispute — Order ${payment.order.orderNumber}`,
      orderId: payment.orderId,
    }));
    const result = await this.prisma.task.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async closeDisputeReviews(now: Date): Promise<number> {
    const openTasks = await this.prisma.task.findMany({
      where: { type: TaskType.REVIEW_DISPUTE, status: TaskStatus.OPEN, source: TaskSource.AUTOMATED },
      select: { id: true, dedupeKey: true },
    });
    if (openTasks.length === 0) return 0;

    const paymentIds = openTasks.map((t) => t.dedupeKey!.split(":")[1]!);
    const stillDisputed = await this.prisma.payment.findMany({
      where: { id: { in: paymentIds }, status: PaymentStatus.DISPUTED },
      select: { id: true },
    });
    const stillDisputedIds = new Set(stillDisputed.map((p) => p.id));
    const toClose = openTasks.filter((t) => !stillDisputedIds.has(t.dedupeKey!.split(":")[1]!)).map((t) => t.id);
    if (toClose.length === 0) return 0;

    const result = await this.prisma.task.updateMany({ where: { id: { in: toClose } }, data: CLOSE_DATA(now) });
    return result.count;
  }
}
