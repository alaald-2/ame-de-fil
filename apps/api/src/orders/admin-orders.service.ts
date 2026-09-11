import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ShipmentStatus,
} from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/payment-provider.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import { toCsv } from "../common/csv.ts";
import {
  ADMIN_ORDER_DETAIL_SELECT,
  ADMIN_ORDER_LIST_SELECT,
  mapAdminOrderDetail,
  mapAdminOrderListItem,
} from "./mappers/admin-order.mapper.ts";
import {
  buildRefundIdempotencyKey,
  hashRefundRequest,
  REFUND_IDEMPOTENCY_SCOPE,
  type RefundIdempotencySnapshot,
} from "./refund-idempotency.ts";
import type { MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import type { FulfillmentResponse } from "./dto/fulfillment-response.ts";
import type { AdminOrderDetailResponse, RefundOrderResponse } from "./dto/admin-order-responses.ts";
import type { RefundOrderInput } from "./dto/refund-order.dto.ts";

const NOT_IN_EXPECTED_STATE = (from: readonly OrderStatus[], to: OrderStatus) =>
  new ConflictException({
    error: "InvalidOrderTransition",
    message: `Order is not in ${from.map((s) => `"${s}"`).join(" or ")} — cannot transition to "${to}"`,
  });

const ORDER_NOT_FOUND = () =>
  new NotFoundException({ error: "OrderNotFound", message: "Order not found" });

const REFUND_ELIGIBLE_PAYMENT_STATUSES = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] as const;

// An order past this point never auto-restocks on a full refund (approved
// design) — the physical item's condition post-shipment is unknown, so
// restocking it is left as a manual admin decision via the existing
// POST /admin/inventory/:variantId/adjustments.
const SHIPPED_ORDER_STATUSES = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
] as const;

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
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Read-only, permission-gated by `orders.view` at the controller (not
  // ownership-checked here) — unlike OrdersController.getStatus's guest/
  // owner-scoped read, an admin holding this permission is authorized to
  // view every order, not just "their own." Least-fetch by construction:
  // both queries use an explicit `select` (never a bare relation include),
  // so a User row can only ever surface id/email/firstName/lastName here,
  // regardless of what's added to the User model later.
  // paymentStatus/refundStatus are optional drill-down filters for the
  // Dashboard's own alert lines (disputed payments, failed refunds) — those
  // alerts previously had nowhere to link to (ROADMAP.md's "deliberately
  // not built: drill-down list endpoints for any alert"). Refund lives on
  // Payment, not Order, hence the nested `some` — an order can have more
  // than one payment/refund, and "any of them matches" is the intended
  // semantics for both filters.
  async listOrders(
    page: number,
    pageSize: number,
    paymentStatus?: PaymentStatus,
    refundStatus?: RefundStatus,
  ) {
    const where: Prisma.OrderWhereInput = {
      ...(paymentStatus ? { payments: { some: { status: paymentStatus } } } : {}),
      ...(refundStatus ? { payments: { some: { refunds: { some: { status: refundStatus } } } } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: ADMIN_ORDER_LIST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map(mapAdminOrderListItem),
      page,
      pageSize,
      total,
    };
  }

  async getOrderDetail(orderId: string): Promise<AdminOrderDetailResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ADMIN_ORDER_DETAIL_SELECT,
    });
    if (!order) throw ORDER_NOT_FOUND();

    return mapAdminOrderDetail(order);
  }

  // For a revisor/accountant, one row per order — filtered by `confirmedAt`
  // (the accounting-relevant date; an order that never confirmed was never
  // real money, so this naturally excludes abandoned carts) rather than
  // `createdAt`. Unpaginated by design: an accounting export needs every
  // row in the requested range in one file, not a page at a time.
  async exportOrdersCsv(from: Date, to: Date): Promise<string> {
    const orders = await this.prisma.order.findMany({
      where: { confirmedAt: { gte: from, lt: to } },
      orderBy: { confirmedAt: "asc" },
      select: {
        orderNumber: true,
        confirmedAt: true,
        shippingName: true,
        guestEmail: true,
        status: true,
        subtotalMinor: true,
        taxMinor: true,
        shippingMinor: true,
        discountMinor: true,
        totalMinor: true,
        user: { select: { email: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          select: {
            status: true,
            method: true,
            providerPaymentIntentId: true,
            createdAt: true,
            refunds: { select: { amountMinor: true, status: true } },
          },
        },
      },
    });

    const headers = [
      "Order number",
      "Date",
      "Customer name",
      "Customer email",
      "Status",
      "Payment method",
      "Payment reference",
      "Subtotal",
      "VAT",
      "Shipping",
      "Discount",
      "Total",
      "Refunded",
      "Net",
    ];

    const toDecimal = (amountMinor: number) => (amountMinor / 100).toFixed(2);

    const rows = orders.map((order) => {
      const paidPayment = order.payments.find((p) => p.status === PaymentStatus.PAID);
      const refundedMinor = order.payments
        .flatMap((p) => p.refunds)
        .filter((r) => r.status === RefundStatus.SUCCEEDED)
        .reduce((sum, r) => sum + r.amountMinor, 0);

      return [
        order.orderNumber,
        order.confirmedAt?.toISOString() ?? "",
        order.shippingName,
        order.user?.email ?? order.guestEmail ?? "",
        order.status,
        paidPayment?.method ?? "",
        paidPayment?.providerPaymentIntentId ?? "",
        toDecimal(order.subtotalMinor),
        toDecimal(order.taxMinor),
        toDecimal(order.shippingMinor),
        toDecimal(order.discountMinor),
        toDecimal(order.totalMinor),
        toDecimal(refundedMinor),
        toDecimal(order.totalMinor - refundedMinor),
      ];
    });

    return toCsv(headers, rows);
  }

  // Amount-based, synchronous-confirmation refund (approved design —
  // PAYMENTS.md §6). Overview of the flow, since it can't be one atomic
  // transaction (the Stripe call must happen outside any DB lock):
  //
  //   1. Reconcile any of this payment's already-SUCCEEDED refunds whose
  //      Order/Payment/inventory/audit effects didn't finish applying on a
  //      prior attempt (idempotent no-op if there's nothing to fix).
  //   2. Idempotency-key lookup — replay a finished result, resume an
  //      in-flight one, reject a same-key-different-body conflict, or fall
  //      through to a fresh attempt.
  //   3. Txn A (short, no network call): SELECT ... FOR UPDATE the Payment
  //      row, compute remaining = amountMinor - SUM(PENDING+SUCCEEDED
  //      refunds), reject if the request exceeds it, then create the
  //      Refund row as PENDING and a matching provisional IdempotencyKey
  //      row — both inside the same lock-holding transaction, so the
  //      *reservation* (not just a prior read) is what a concurrent
  //      request sees. Lock is released the moment this commits.
  //   4. Call Stripe, outside any lock, with an idempotency key derived
  //      from the Refund row's own id (never the caller's header) — safe
  //      to repeat if this exact step is ever resumed.
  //   5. On success: immediately persist providerRefundId + SUCCEEDED (its
  //      own tiny transaction) *before* anything else — the durable proof
  //      that money moved, independent of whether the next step completes.
  //   6. Apply Order/Payment/inventory/audit effects (idempotent, keyed on
  //      whether this refund's own AuditLog entry already exists).
  //   7. Finalize the IdempotencyKey row's snapshot so a future identical
  //      request replays this exact result.
  //
  // If step 6 fails after step 5 committed, the Refund row is already
  // correctly SUCCEEDED — nothing is lost — but Order/Payment/inventory/
  // audit may lag until a future refund attempt on this same payment
  // reconciles it (step 1) or a real reconciliation job exists (not built
  // this checkpoint; disclosed limitation, not silently assumed away).
  async issueRefund(
    orderId: string,
    input: RefundOrderInput,
    idempotencyKeyHeader: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<RefundOrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        payments: {
          where: { status: { in: [...REFUND_ELIGIBLE_PAYMENT_STATUSES] } },
          select: { id: true, providerPaymentIntentId: true },
        },
      },
    });
    if (!order) throw ORDER_NOT_FOUND();
    if (order.payments.length === 0) {
      throw new BadRequestException({
        error: "NoRefundablePayment",
        message: "This order has no payment in a refundable state",
      });
    }
    if (order.payments.length > 1) {
      // Never expected under the current checkout design (one Payment per
      // Order) — surfaced loudly rather than guessing which one, since
      // guessing wrong here means refunding the wrong charge.
      throw new Error(`Order ${orderId} has more than one refund-eligible Payment`);
    }
    const [payment] = order.payments;
    if (!payment!.providerPaymentIntentId) {
      throw new BadRequestException({
        error: "NoRefundablePayment",
        message: "This order's payment has no provider payment intent to refund",
      });
    }
    const paymentId = payment!.id;

    // Step 1 — bounded, best-effort recovery (approved design, not full
    // reconciliation): fixes up any earlier SUCCEEDED-but-unapplied refund
    // on this same payment before this new request's own eligibility is
    // evaluated, so "remaining" reflects reality.
    await this.reconcileOutstandingRefunds(paymentId);

    const key = buildRefundIdempotencyKey(orderId, idempotencyKeyHeader);
    const requestHash = hashRefundRequest({
      orderId,
      amountMinor: input.amountMinor,
      reason: input.reason,
    });
    const now = new Date();

    const replay = await this.checkRefundIdempotency(key, requestHash, now);
    if (replay) {
      if (replay.phase === "final") return replay.response;
      // phase === "pending" — a prior attempt under this key reserved this
      // exact Refund row but never finished. Resume it, reusing its id (and
      // therefore its Stripe idempotency key) rather than reserving again.
      return this.continueRefund(replay.refundId, key, now, ipAddress);
    }

    let refundId: string;
    try {
      refundId = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; amountMinor: number }[]>(
          Prisma.sql`SELECT "id", "amountMinor" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`,
        );
        const lockedPayment = locked[0];
        if (!lockedPayment) throw ORDER_NOT_FOUND();

        const reservedAgg = await tx.refund.aggregate({
          where: { paymentId, status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] } },
          _sum: { amountMinor: true },
        });
        const remaining = lockedPayment.amountMinor - (reservedAgg._sum.amountMinor ?? 0);
        if (input.amountMinor > remaining) {
          throw new BadRequestException({
            error: "RefundExceedsRemaining",
            message: `Only ${remaining} minor unit(s) remain refundable on this payment`,
          });
        }

        const refund = await tx.refund.create({
          data: {
            paymentId,
            amountMinor: input.amountMinor,
            reason: input.reason,
            status: RefundStatus.PENDING,
            initiatedByUserId: actorUserId,
          },
        });

        const snapshot: RefundIdempotencySnapshot = { phase: "pending", refundId: refund.id };
        await tx.idempotencyKey.create({
          data: {
            key,
            scope: REFUND_IDEMPOTENCY_SCOPE,
            requestHash,
            responseSnapshot: snapshot,
            expiresAt: new Date(
              now.getTime() +
                this.config.get("REFUND_IDEMPOTENCY_TTL_HOURS", { infer: true }) * 60 * 60 * 1000,
            ),
          },
        });

        return refund.id;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, "IdempotencyKey", "key")) {
        // Lost a genuine concurrent race for this exact key — another
        // request with the identical key committed first. Resolve the
        // same way that request's own caller would, not with a raw
        // constraint error.
        const winner = await this.checkRefundIdempotency(key, requestHash, now);
        if (winner?.phase === "final") return winner.response;
        if (winner?.phase === "pending") return this.continueRefund(winner.refundId, key, now, ipAddress);
      }
      throw error;
    }

    return this.continueRefund(refundId, key, now, ipAddress);
  }

  private async checkRefundIdempotency(
    key: string,
    requestHash: string,
    now: Date,
  ): Promise<RefundIdempotencySnapshot | null> {
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) return null;

    if (existing.expiresAt.getTime() > now.getTime()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          error: "IdempotencyKeyConflict",
          message: "This Idempotency-Key was already used for a different refund request",
        });
      }
      return existing.responseSnapshot as RefundIdempotencySnapshot;
    }

    // Expired — reclaim so a fresh attempt can use it.
    await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
    return null;
  }

  // Resumes (or performs, for a freshly-created reservation) the part of
  // the flow that can't live inside the locked reservation transaction:
  // the Stripe call itself, and everything after it. Safe to call more
  // than once for the same refundId — the Stripe call is idempotency-keyed
  // on refundId, and applyRefundEffects is idempotent on its own audit marker.
  private async continueRefund(
    refundId: string,
    key: string,
    now: Date,
    ipAddress?: string,
  ): Promise<RefundOrderResponse> {
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      select: {
        id: true,
        status: true,
        amountMinor: true,
        payment: { select: { providerPaymentIntentId: true } },
      },
    });

    if (refund.status === RefundStatus.SUCCEEDED) {
      await this.applyRefundEffects(refundId, ipAddress);
      const response = await this.buildRefundResponse(refundId);
      await this.finalizeRefundIdempotency(key, response);
      return response;
    }

    if (refund.status === RefundStatus.FAILED) {
      // A resumed attempt should never find FAILED (checkRefundIdempotency
      // only ever resumes a "pending"-phase snapshot, and a FAILED
      // terminal outcome always reclaims its key — see the catch block
      // below) — surfaced as a real error rather than silently retried,
      // since retrying past a definitive failure needs a fresh request.
      throw new ConflictException({
        error: "RefundAlreadyFailed",
        message: "This refund attempt already failed — submit a new request to retry",
      });
    }

    let providerResult;
    try {
      providerResult = await this.paymentProvider.refund({
        providerPaymentIntentId: refund.payment.providerPaymentIntentId!,
        amountMinor: refund.amountMinor,
        idempotencyKey: `refund:${refund.id}`,
      });
    } catch (error) {
      await this.prisma.refund.updateMany({
        where: { id: refundId, status: RefundStatus.PENDING },
        data: { status: RefundStatus.FAILED },
      });
      await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw new UnprocessableEntityException({
        error: "RefundFailed",
        message: error instanceof Error ? error.message : "The payment provider rejected the refund",
      });
    }

    if (providerResult.status === "succeeded") {
      // The durable proof step — committed before anything else runs.
      await this.prisma.refund.updateMany({
        where: { id: refundId, status: RefundStatus.PENDING },
        data: {
          status: RefundStatus.SUCCEEDED,
          providerRefundId: providerResult.providerRefundId,
          processedAt: now,
        },
      });
      await this.applyRefundEffects(refundId, ipAddress);
      const response = await this.buildRefundResponse(refundId);
      await this.finalizeRefundIdempotency(key, response);
      return response;
    }

    if (providerResult.status === "failed") {
      await this.prisma.refund.updateMany({
        where: { id: refundId, status: RefundStatus.PENDING },
        data: { status: RefundStatus.FAILED, providerRefundId: providerResult.providerRefundId },
      });
      await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw new UnprocessableEntityException({
        error: "RefundFailed",
        message: "The payment provider declined the refund",
      });
    }

    // "pending" — Stripe itself hasn't resolved this yet. Synchronous
    // confirmation only (approved design, no webhook built this
    // checkpoint): record the provider's id for traceability, leave the
    // Refund PENDING, apply no Order/Payment/inventory effects, and don't
    // memoize a final idempotency snapshot — a later identical request
    // will resume this exact attempt (via the still-"pending"-phase
    // IdempotencyKey row) rather than reserving a second one.
    await this.prisma.refund.updateMany({
      where: { id: refundId },
      data: { providerRefundId: providerResult.providerRefundId },
    });
    return this.buildRefundResponse(refundId);
  }

  // Idempotent on its own audit marker: an AuditLog row keyed on this
  // exact refundId is the definitive "already applied" signal, so calling
  // this twice for the same refund (immediately after Stripe succeeds, and
  // again later via reconcileOutstandingRefunds) is always safe.
  //
  // Also serializes on the SAME Payment-row lock issueRefund's reservation
  // uses (released the moment this transaction commits, same as there) —
  // required, not defensive: two concurrent callers can legitimately reach
  // this for the same payment (two concurrent continueRefund resumes of one
  // racing Idempotency-Key both computing a since-Stripe-dedupes-them
  // identical result; or two *different* refunds on the same payment
  // completing at nearly the same time). Without this lock, each could read
  // the SUM(SUCCEEDED) aggregate before the other's write is visible,
  // independently conclude "not yet the full amount" or "not yet applied",
  // and either double-restock the same items or leave Payment/Order status
  // stuck one refund behind — a lost-update race, distinct from (but as
  // serious as) the over-refund race issueRefund's own lock prevents.
  private async applyRefundEffects(refundId: string, ipAddress?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        select: { id: true, amountMinor: true, initiatedByUserId: true, paymentId: true },
      });

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${refund.paymentId} FOR UPDATE`);

      const alreadyApplied = await tx.auditLog.findFirst({
        where: { entityType: "Refund", entityId: refund.id },
        select: { id: true },
      });
      if (alreadyApplied) return;

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: refund.paymentId },
        select: { id: true, orderId: true, amountMinor: true, status: true },
      });

      const succeededAgg = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: RefundStatus.SUCCEEDED },
        _sum: { amountMinor: true },
      });
      const totalSucceeded = succeededAgg._sum.amountMinor ?? 0;
      const isFullRefund = totalSucceeded >= payment.amountMinor;
      const newPaymentStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: [...REFUND_ELIGIBLE_PAYMENT_STATUSES] },
        },
        data: { status: newPaymentStatus },
      });

      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { id: true, status: true },
      });
      const wasShipped = (SHIPPED_ORDER_STATUSES as readonly OrderStatus[]).includes(order.status);
      const newOrderStatus = isFullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED;

      const orderTransition = await tx.order.updateMany({
        where: { id: order.id, status: { not: OrderStatus.REFUNDED } },
        data: { status: newOrderStatus },
      });

      // Gated on the guarded UPDATE's own row count, not on the plain
      // `isFullRefund` boolean read above: `isFullRefund` stays true for
      // every refund on this payment once the cumulative total reaches the
      // full amount, so two different refunds completing at nearly the
      // same time (each unlocked-write of its own Refund -> SUCCEEDED
      // happens *before* either reaches this transaction, so both can see
      // the same already-full total) would otherwise BOTH conclude
      // "restock now" and double the increment. Postgres serializes the
      // two transactions' UPDATEs to this same Order row and re-evaluates
      // the `status: { not: REFUNDED }` guard against the just-committed
      // row for whichever runs second — exactly one of them ever observes
      // count > 0, so restocking (an increment, not an idempotent set —
      // unlike the Payment/Order status writes above, which safely
      // reconverge if repeated) runs exactly once per order.
      if (isFullRefund && !wasShipped && orderTransition.count > 0) {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id, madeToOrder: false },
          select: { id: true, productVariantId: true, quantity: true },
        });
        for (const item of items) {
          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { productVariantId: item.productVariantId },
            select: { id: true },
          });
          if (!inventoryItem) continue; // defensive — a non-made-to-order line always has one
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: { onHand: { increment: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: InventoryMovementType.RETURN,
              quantity: item.quantity,
              relatedOrderItemId: item.id,
              createdByUserId: refund.initiatedByUserId,
              reason: `Refund ${refund.id}`,
            },
          });
        }
      }

      // Attributed to whoever actually initiated this refund — not
      // necessarily whoever's later action triggered this to finally
      // apply (reconcileOutstandingRefunds may run this well after the
      // fact, from an unrelated request). Non-null: issueRefund always sets
      // initiatedByUserId from the authenticated caller at reservation time
      // (the column is only nullable for onDelete: SetNull if that admin
      // account is later deleted — a fallback literal here would violate
      // AuditLog.actorUserId's own foreign key rather than degrade gracefully).
      await this.audit.record(
        {
          actorUserId: refund.initiatedByUserId!,
          action: "order.refund_issued",
          entityType: "Refund",
          entityId: refund.id,
          before: { paymentStatus: payment.status, orderStatus: order.status },
          after: { paymentStatus: newPaymentStatus, orderStatus: newOrderStatus, amountMinor: refund.amountMinor },
          ipAddress,
        },
        tx,
      );
    });
  }

  // Re-applies effects for any of this payment's refunds that reached
  // SUCCEEDED but whose Order/Payment/inventory/audit side effects didn't
  // finish (a prior process crash between the two). Bounded, best-effort
  // recovery (approved design) — not a substitute for a real reconciliation
  // job, which this checkpoint deliberately does not build: if no further
  // refund attempt ever touches this payment again, an incomplete
  // application can persist until one does, or until that job exists.
  private async reconcileOutstandingRefunds(paymentId: string): Promise<void> {
    const succeeded = await this.prisma.refund.findMany({
      where: { paymentId, status: RefundStatus.SUCCEEDED },
      select: { id: true },
    });
    for (const refund of succeeded) {
      await this.applyRefundEffects(refund.id);
    }
  }

  private async finalizeRefundIdempotency(key: string, response: RefundOrderResponse): Promise<void> {
    const snapshot: RefundIdempotencySnapshot = { phase: "final", response };
    await this.prisma.idempotencyKey.update({
      where: { key },
      data: { responseSnapshot: snapshot },
    });
  }

  private async buildRefundResponse(refundId: string): Promise<RefundOrderResponse> {
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      select: {
        id: true,
        status: true,
        amountMinor: true,
        payment: {
          select: { status: true, currency: true, order: { select: { status: true } } },
        },
      },
    });

    return {
      refundId: refund.id,
      status: refund.status,
      amount: { amountMinor: refund.amountMinor, currency: refund.payment.currency },
      orderStatus: refund.payment.order.status,
      paymentStatus: refund.payment.status,
    };
  }

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
